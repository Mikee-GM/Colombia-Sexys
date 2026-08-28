import { Injectable, Logger } from '@nestjs/common';
import { Context } from 'telegraf';

/**
 * Cuanto se considera repetida una pulsacion del mismo boton.
 *
 * Cubre el doble clic humano y la rafaga de quien pulsa nervioso mientras el
 * manejador todavia trabaja, que es de lejos el caso real. No pretende ser un
 * cerrojo distribuido: la verdad de cada accion es su transicion de estado
 * condicionada en la base, y esto solo evita llegar hasta ahi por duplicado.
 */
const VENTANA_MS = 10_000;

/** A partir de cuantas entradas se limpia el registro de pulsaciones. */
const LIMPIEZA_CADA = 200;

/**
 * Reconoce la pulsacion repetida del mismo boton.
 *
 * Telegram entrega cada toque como un update independiente, con su propio
 * `callback_query.id`, asi que deduplicar por ese id no sirve de nada: dos
 * clics son dos ids distintos. Lo que identifica al mismo boton es el trio
 * chat + mensaje + datos del boton, y eso es lo que se recuerda aqui.
 *
 * El registro vive en memoria de este proceso a proposito. Con varias replicas
 * dos toques pueden caer en procesos distintos y ninguno vera al otro; para eso
 * estan las transiciones condicionadas (`UPDATE ... WHERE estado = :esperado`),
 * que son las que de verdad impiden ejecutar dos veces la misma accion. Esta
 * clase es la primera linea, la barata, no la unica.
 */
@Injectable()
export class TelegramCallbackGuard {
  private readonly logger = new Logger(TelegramCallbackGuard.name);
  private readonly vistas = new Map<string, number>();

  /**
   * Clave del boton pulsado: mismo mensaje y mismos datos, misma accion.
   *
   * Sin `messageId` dos botones iguales en dos mensajes distintos --el resumen
   * de dos servicios, por ejemplo-- se estorbarian entre si.
   */
  private clave(ctx: Context): string | undefined {
    const callback = ctx.callbackQuery;
    if (!callback || !('data' in callback) || !callback.data) return undefined;
    const chatId = callback.message?.chat?.id ?? ctx.from?.id;
    const messageId = callback.message?.message_id ?? 0;
    if (chatId === undefined) return undefined;
    return `${chatId}:${messageId}:${callback.data}`;
  }

  /**
   * `true` si este boton ya se pulso hace un instante y hay que ignorarlo.
   *
   * Contesta el callback para que a quien pulso se le apague el reloj de arena
   * y sepa que su primer toque sigue en marcha; sin eso, Telegram deja el boton
   * girando y la reaccion natural es volver a pulsar.
   */
  async esRepetido(ctx: Context): Promise<boolean> {
    const clave = this.clave(ctx);
    if (!clave) return false;

    const ahora = Date.now();
    const anterior = this.vistas.get(clave);
    if (anterior !== undefined && ahora - anterior < VENTANA_MS) {
      this.logger.warn(`Pulsacion repetida ignorada: ${clave}`);
      await ctx
        .answerCbQuery('Ya estoy procesando eso, dame un segundo.')
        .catch(() => undefined);
      return true;
    }

    this.vistas.set(clave, ahora);
    if (this.vistas.size > LIMPIEZA_CADA) this.limpiar(ahora);
    return false;
  }

  /**
   * Olvida una pulsacion para que el mismo boton vuelva a admitirse ya.
   *
   * Lo necesita el manejador que termina rechazando la accion --sesion
   * caducada, permisos, estado equivocado--: ahi el usuario corrige y vuelve a
   * pulsar en el acto, y hacerle esperar la ventana entera seria un castigo por
   * un intento que no llego a ejecutarse.
   */
  liberar(ctx: Context): void {
    const clave = this.clave(ctx);
    if (clave) this.vistas.delete(clave);
  }

  private limpiar(ahora: number): void {
    for (const [clave, instante] of this.vistas) {
      if (ahora - instante >= VENTANA_MS) this.vistas.delete(clave);
    }
  }
}
