import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PushSubscription } from './entities/push-subscription.entity';

export type PushDeviceStatus = {
  id: string;
  userAgent: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date;
  lastSentAt: Date | null;
  failureCount: number;
  lastFailureAt: Date | null;
};

/** Reduce el user-agent a una etiqueta util sin guardar una huella completa. */
export function resumirUserAgent(userAgent?: string): string | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  const sistema = /iphone|ipad|ipod/.test(ua)
    ? 'iOS'
    : /android/.test(ua)
      ? 'Android'
      : /windows/.test(ua)
        ? 'Windows'
        : /macintosh|mac os x/.test(ua)
          ? 'macOS'
          : /linux/.test(ua)
            ? 'Linux'
            : 'Otro';
  const navegador = /edg\//.test(ua)
    ? 'Edge'
    : /crios|chrome\//.test(ua)
      ? 'Chrome'
      : /firefox|fxios/.test(ua)
        ? 'Firefox'
        : /safari\//.test(ua)
          ? 'Safari'
          : 'Navegador';
  return `${navegador} en ${sistema}`;
}

@Injectable()
export class PushSubscriptionsService {
  constructor(
    @InjectRepository(PushSubscription)
    private readonly suscripciones: Repository<PushSubscription>,
  ) {}

  /**
   * Da de alta el dispositivo, o lo actualiza si ya estaba.
   *
   * El upsert va por `endpoint` y no por usuario: un navegador que renueva su
   * suscripcion manda el mismo endpoint, y tratarlo como alta nueva dejaria dos
   * filas apuntando al mismo telefono y dos avisos identicos por evento.
   *
   * El `usuario_id` tambien se actualiza a proposito: si alguien presta el
   * dispositivo y entra otra persona, el destino pasa a ser suyo en vez de
   * seguir mandandole los avisos al anterior.
   */
  async registrar(
    usuarioId: string,
    destino: { endpoint: string; p256dh: string; auth: string },
    userAgent?: string,
  ): Promise<void> {
    await this.suscripciones.query(
      `INSERT INTO push_subscriptions
              (usuario_id, endpoint, p256dh, auth, user_agent,
               actualizada_en, ultima_vista_en, habilitada)
       VALUES ($1, $2, $3, $4, $5, now(), now(), true)
       ON CONFLICT (endpoint)
       DO UPDATE SET usuario_id = EXCLUDED.usuario_id,
                     p256dh     = EXCLUDED.p256dh,
                     auth       = EXCLUDED.auth,
                     user_agent = EXCLUDED.user_agent,
                     actualizada_en = now(),
                     ultima_vista_en = now(),
                     habilitada = true,
                     fallos     = 0,
                     ultimo_fallo_en = NULL`,
      [
        usuarioId,
        destino.endpoint,
        destino.p256dh,
        destino.auth,
        resumirUserAgent(userAgent),
      ],
    );
  }

  listarDe(usuarioId: string): Promise<PushSubscription[]> {
    return this.suscripciones.find({
      where: { usuarioId, habilitada: true },
    });
  }

  async estadoDe(usuarioId: string): Promise<PushDeviceStatus[]> {
    const dispositivos = await this.suscripciones.find({
      where: { usuarioId },
      order: { ultimaVistaEn: 'DESC' },
    });
    return dispositivos.map((dispositivo) => ({
      id: dispositivo.id,
      userAgent: dispositivo.userAgent,
      enabled: dispositivo.habilitada,
      createdAt: dispositivo.creadaEn,
      updatedAt: dispositivo.actualizadaEn,
      lastSeenAt: dispositivo.ultimaVistaEn,
      lastSentAt: dispositivo.ultimoEnvio,
      failureCount: dispositivo.fallos,
      lastFailureAt: dispositivo.ultimoFalloEn,
    }));
  }

  /**
   * Baja voluntaria desde el propio dispositivo.
   *
   * Se acota al usuario de la sesion para que nadie pueda dar de baja el
   * telefono de otro conociendo su endpoint.
   */
  async darDeBaja(usuarioId: string, endpoint: string): Promise<void> {
    await this.suscripciones.update(
      { usuarioId, endpoint },
      { habilitada: false, actualizadaEn: new Date() },
    );
  }

  /** Desactiva un endpoint que el servicio de push confirma como inexistente. */
  async olvidar(endpoint: string): Promise<void> {
    await this.suscripciones.update(
      { endpoint },
      { habilitada: false, actualizadaEn: new Date() },
    );
  }

  async marcarVista(usuarioId: string, endpoint: string): Promise<void> {
    await this.suscripciones.update(
      { usuarioId, endpoint, habilitada: true },
      { ultimaVistaEn: new Date(), actualizadaEn: new Date() },
    );
  }

  async marcarEnvio(id: string): Promise<void> {
    await this.suscripciones.update(
      { id },
      {
        ultimoEnvio: new Date(),
        actualizadaEn: new Date(),
        fallos: 0,
        ultimoFalloEn: null,
      },
    );
  }

  async marcarFallo(id: string): Promise<number> {
    const filas = (await this.suscripciones.query(
      `UPDATE push_subscriptions
          SET fallos = fallos + 1,
              ultimo_fallo_en = now(),
              actualizada_en = now()
        WHERE id = $1
        RETURNING fallos`,
      [id],
    )) as { fallos: number }[];
    return filas[0]?.fallos ?? 0;
  }
}
