import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PushSubscription } from './entities/push-subscription.entity';

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
              (usuario_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint)
       DO UPDATE SET usuario_id = EXCLUDED.usuario_id,
                     p256dh     = EXCLUDED.p256dh,
                     auth       = EXCLUDED.auth,
                     user_agent = EXCLUDED.user_agent,
                     fallos     = 0`,
      [
        usuarioId,
        destino.endpoint,
        destino.p256dh,
        destino.auth,
        userAgent ?? null,
      ],
    );
  }

  listarDe(usuarioId: string): Promise<PushSubscription[]> {
    return this.suscripciones.find({ where: { usuarioId } });
  }

  /**
   * Baja voluntaria desde el propio dispositivo.
   *
   * Se acota al usuario de la sesion para que nadie pueda dar de baja el
   * telefono de otro conociendo su endpoint.
   */
  async darDeBaja(usuarioId: string, endpoint: string): Promise<void> {
    await this.suscripciones.delete({ usuarioId, endpoint });
  }

  /** Borrado por endpoint, para cuando el servicio de push dice que ya no existe. */
  async olvidar(endpoint: string): Promise<void> {
    await this.suscripciones.delete({ endpoint });
  }

  async marcarEnvio(id: string): Promise<void> {
    await this.suscripciones.update(
      { id },
      { ultimoEnvio: new Date(), fallos: 0 },
    );
  }

  async marcarFallo(id: string): Promise<void> {
    await this.suscripciones.increment({ id }, 'fallos', 1);
  }
}
