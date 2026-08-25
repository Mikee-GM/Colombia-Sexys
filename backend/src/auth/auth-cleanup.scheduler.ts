import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  ADVISORY_LOCKS,
  withAdvisoryLock,
} from '../common/scheduling/advisory-lock';
import { PanelAccessService } from './panel-access.service';
import { AuthService } from './auth.service';

/** Cada hora basta: son filas pequeñas y nadie las consulta. */
const INTERVALO_MS = 60 * 60 * 1000;

/** Primer barrido poco despues de arrancar, sin competir con el arranque. */
const RETRASO_INICIAL_MS = 60_000;

/**
 * Limpieza de las dos tablas de sesion que crecen solas.
 *
 * `panel_access_tokens`: cada vez que alguien abre su panel desde Telegram
 * queda una fila que deja de servir a los cinco minutos. Se borran con un dia
 * de retraso sobre la caducidad, no al instante: si algo sale raro con un
 * acceso, ese margen deja ver que el pase existio y cuando se uso.
 *
 * `auth_sessions`: cada refresco rota la sesion y deja la anterior revocada,
 * asi que un usuario activo produce decenas de filas al dia. Se barre con el
 * criterio conservador que explica `AuthService.purgeStaleSessions`.
 */
@Injectable()
export class AuthCleanupScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthCleanupScheduler.name);
  private timer?: any;
  private running = false;

  constructor(
    private readonly panelAccessService: PanelAccessService,
    private readonly authService: AuthService,
    private readonly dataSource: DataSource,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runCycle(), INTERVALO_MS);
    if (typeof this.timer?.unref === 'function') this.timer.unref();

    const inicial: any = setTimeout(
      () => void this.runCycle(),
      RETRASO_INICIAL_MS,
    );
    if (typeof inicial?.unref === 'function') inicial.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runCycle() {
    if (this.running) return;
    this.running = true;
    try {
      // Con dos replicas, las dos barrerian la misma tabla a la vez. El borrado
      // es idempotente, pero el lock evita el trabajo duplicado y el ruido.
      await withAdvisoryLock(this.dataSource, ADVISORY_LOCKS.authCleanup, () =>
        this.purge(),
      );
    } catch (error) {
      this.logger.error('Error en AuthCleanupScheduler:', error);
    } finally {
      this.running = false;
    }
  }

  private async purge(): Promise<void> {
    /*
     * Secuencial y no en paralelo: son dos borrados sobre la misma base y no
     * hay prisa. Si el primero falla, el segundo no llega a correr y el ciclo
     * siguiente lo reintenta.
     */
    await this.panelAccessService.purgeExpired();
    await this.authService.purgeStaleSessions();
  }
}
