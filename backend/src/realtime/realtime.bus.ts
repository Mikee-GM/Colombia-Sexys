import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, LessThan, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { describeError } from '../common/errors/error-message';
import { withAdvisoryLock } from '../common/scheduling/advisory-lock';
import { RealtimeOutboxEvent } from './realtime-outbox.entity';

/** Canal de Postgres por el que se avisa de que hay un evento nuevo. */
const CHANNEL = 'realtime_events';
/** Lo entregado deja de hacer falta enseguida; se conserva un margen holgado. */
const RETENTION_MS = 5 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;
const OUTBOX_SWEEP_LOCK = 811_006;
/** Espera antes de volver a intentar el `LISTEN` si se cae la conexion. */
const RECONNECT_DELAY_MS = 5_000;

/** Lo que una replica le cuenta a las demas. */
export type RealtimeMessage = {
  /** A que registro de canales va dirigido. */
  target: 'jefes' | 'boss' | 'employee' | 'driver' | 'client';
  /** Id del destinatario dentro de ese registro, si lo hay. */
  key: string | null;
  event: unknown;
};

/**
 * Reparte los eventos en vivo entre las replicas del backend.
 *
 * El servicio de SSE sigue entregando en local igual que siempre —sin pasar por
 * la base y sin latencia añadida—, y ademas publica aqui para que las demas
 * replicas lo entreguen a sus propios suscriptores. Los mensajes propios se
 * descartan al volver, por el identificador de instancia.
 *
 * Si la conexion de escucha se cae, la entrega local sigue funcionando: lo que
 * se pierde mientras tanto es solo la parte entre replicas, y se reintenta.
 */
@Injectable()
export class RealtimeBus implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeBus.name);
  /** Distingue lo que publica esta replica de lo que llega de las demas. */
  private readonly instanceId = randomUUID();

  private handler: ((message: RealtimeMessage) => void) | null = null;
  private listener: { release: () => Promise<void> } | null = null;
  private sweepTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private stopped = false;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(RealtimeOutboxEvent)
    private readonly outbox: Repository<RealtimeOutboxEvent>,
  ) {}

  /** El servicio de SSE registra aqui como entregar lo que llegue de fuera. */
  onRemoteMessage(handler: (message: RealtimeMessage) => void): void {
    this.handler = handler;
  }

  async onModuleInit(): Promise<void> {
    await this.startListening();
    this.sweepTimer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    await this.listener?.release().catch(() => undefined);
  }

  /**
   * Publica para las demas replicas. No entrega en local: de eso ya se ocupo
   * quien llamo, antes y sin esperar a la base.
   */
  async publish(message: RealtimeMessage): Promise<void> {
    try {
      const saved = await this.outbox.save(
        this.outbox.create({
          payload: { ...message, origin: this.instanceId },
        }),
      );
      // La carga util de NOTIFY esta limitada a 8 KB y un evento puede pasarse,
      // asi que por el canal solo viaja el identificador de la fila.
      await this.dataSource.query(`SELECT pg_notify($1, $2)`, [
        CHANNEL,
        String(saved.id),
      ]);
    } catch (error) {
      // Que falle el reparto entre replicas no puede tumbar la operacion que lo
      // provoco: en local el evento ya se entrego.
      this.logger.warn(
        `No se pudo publicar el evento en vivo: ${describeError(error)}`,
      );
    }
  }

  private async startListening(): Promise<void> {
    if (this.stopped) return;
    try {
      const runner = this.dataSource.createQueryRunner();
      await runner.connect();

      // La conexion queda dedicada a escuchar: `LISTEN` es por conexion, y una
      // del pool volveria a el y dejaria de recibir.
      const client = (
        runner as unknown as {
          databaseConnection: {
            on: (event: string, cb: (arg: unknown) => void) => void;
            query: (sql: string) => Promise<unknown>;
          };
        }
      ).databaseConnection;

      client.on('notification', (raw: unknown) => {
        const payload = (raw as { payload?: string }).payload;
        if (payload) void this.deliver(payload);
      });
      client.on('error', (error: unknown) => {
        this.logger.warn(
          `Conexión de escucha caída: ${describeError(error)}. Se reintenta.`,
        );
        this.scheduleReconnect();
      });

      await client.query(`LISTEN ${CHANNEL}`);
      this.listener = { release: () => runner.release() };
      this.logger.log(
        `Escuchando eventos en vivo de otras réplicas (instancia ${this.instanceId.slice(0, 8)}).`,
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo abrir la escucha de eventos: ${describeError(error)}. Se reintenta.`,
      );
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.startListening();
    }, RECONNECT_DELAY_MS);
    this.reconnectTimer.unref?.();
  }

  private async deliver(id: string): Promise<void> {
    if (!this.handler) return;
    try {
      const row = await this.outbox.findOne({ where: { id } });
      if (!row) return;

      const payload = row.payload as RealtimeMessage & { origin?: string };
      // Lo que publico esta misma replica ya se entrego en local.
      if (payload.origin === this.instanceId) return;

      this.handler({
        target: payload.target,
        key: payload.key,
        event: payload.event,
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo entregar el evento ${id}: ${describeError(error)}`,
      );
    }
  }

  private async sweep(): Promise<void> {
    try {
      await withAdvisoryLock(this.dataSource, OUTBOX_SWEEP_LOCK, async () => {
        await this.outbox.delete({
          createdAt: LessThan(new Date(Date.now() - RETENTION_MS)),
        });
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo purgar el buzón de eventos: ${describeError(error)}`,
      );
    }
  }
}
