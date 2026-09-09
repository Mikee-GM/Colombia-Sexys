import type { Logger } from '@nestjs/common';

import { momentoDeTurno, sqlTurnoVigenteNumerado } from './turno-vigente';

/**
 * Por qué el reparto no encontró ningún chofer.
 *
 * Nueve condiciones tienen que cumplirse a la vez y basta con que falle una
 * para que la lista salga vacía. Sin este desglose el síntoma es siempre el
 * mismo --"no hay choferes disponibles"-- da igual si el problema es que nadie
 * comparte ubicación, que todos cerraron su jornada, que quedaron marcados
 * como ocupados por viajes que nunca se cerraron, o que su turno no cubre esta
 * hora.
 *
 * Es una función suelta y no un método de `DriversService` a propósito: quien
 * más lo necesita es el reparto, que vive en `ServicesService`, y hacer que un
 * módulo dependa del otro solo para pedir un diagnóstico obligaría a un
 * `forwardRef` entre dos módulos que ya se referencian. Lo único que hace falta
 * es poder lanzar una consulta.
 */

/** Lo mínimo para lanzar la consulta: cualquier repositorio o el DataSource. */
type LanzadorDeConsulta = {
  query(sql: string, parametros?: unknown[]): Promise<any>;
};

export type ContextoDelReparto = {
  /**
   * Los que ya recibieron la oferta de ESTE viaje y por eso no vuelven a
   * salir. Sin esto, un reparto que agotó la lista se lee como si no hubiera
   * choferes, cuando lo que pasa es que todos dijeron que no.
   */
  choferesYaNotificados?: string[];
  /** Para nombrar el viaje en el registro. */
  viajeId?: string;
};

export async function explicarFaltaDeChoferes(
  db: LanzadorDeConsulta,
  logger: Logger,
  contexto: ContextoDelReparto = {},
): Promise<void> {
  const yaNotificados = contexto.choferesYaNotificados ?? [];
  const donde = contexto.viajeId ? ` para el viaje ${contexto.viajeId}` : '';

  try {
    const { currentTime, currentDow, yesterdayDow } = momentoDeTurno();
    const turnoVigente = sqlTurnoVigenteNumerado('c', {
      currentTime: 1,
      currentDow: 2,
      yesterdayDow: 3,
    });

    /*
     * El embudo va en el mismo orden que la consulta del reparto y cada
     * escalón incluye los anteriores, así que el primer número que cae a cero
     * es la condición que hay que arreglar.
     *
     * Las tres últimas --sanción, turno y oferta ya enviada-- faltaban, y son
     * justamente las menos evidentes: quien mira la ficha del chofer lo ve
     * disponible y en jornada, y no tiene forma de sospechar que el problema
     * es un turno que hoy no cubre esta hora.
     */
    const sinSancion = `NOT EXISTS (
      SELECT 1 FROM disciplinary_sanctions ds
      WHERE ds.subject_type = 'driver' AND ds.subject_id = c.id
        AND ds.status = 'active' AND ds.starts_at <= now()
        AND (ds.type = 'permanent_ban' OR ds.ends_at > now()))`;
    const base = `u.activo AND u.en_jornada AND c.disponible
                  AND u.telegram_chat_id IS NOT NULL
                  AND c.ubicacion_lat IS NOT NULL AND c.ubicacion_lng IS NOT NULL`;

    const [conteo]: Array<Record<string, string>> = await db.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE u.activo)::int AS activos,
         COUNT(*) FILTER (WHERE u.activo AND u.en_jornada)::int AS en_jornada,
         COUNT(*) FILTER (WHERE u.activo AND u.en_jornada AND c.disponible)::int AS disponibles,
         COUNT(*) FILTER (WHERE u.activo AND u.en_jornada AND c.disponible
                          AND u.telegram_chat_id IS NOT NULL)::int AS con_telegram,
         COUNT(*) FILTER (WHERE ${base})::int AS con_ubicacion,
         COUNT(*) FILTER (WHERE ${base} AND ${sinSancion})::int AS sin_sancion,
         COUNT(*) FILTER (WHERE ${base} AND ${sinSancion}
                          AND ${turnoVigente})::int AS en_turno,
         COUNT(*) FILTER (WHERE ${base} AND ${sinSancion}
                          AND ${turnoVigente}
                          AND NOT (c.id = ANY($4::uuid[])))::int AS sin_ofertar
       FROM choferes c
       JOIN usuarios u ON u.id = c.usuario_id`,
      [currentTime, currentDow, yesterdayDow, yaNotificados],
    );

    logger.warn(
      `Sin choferes para el reparto${donde}. De ` +
        `${conteo.total} choferes: ${conteo.activos} con cuenta activa, ` +
        `${conteo.en_jornada} dentro de su jornada, ` +
        `${conteo.disponibles} no ocupados, ` +
        `${conteo.con_telegram} con Telegram vinculado, ` +
        `${conteo.con_ubicacion} con ubicacion registrada, ` +
        `${conteo.sin_sancion} sin sancion activa, ` +
        `${conteo.en_turno} dentro de un turno suyo, ` +
        `${conteo.sin_ofertar} a los que no se les ha ofrecido ya este viaje. ` +
        'El primer numero que cae a cero es la causa.',
    );

    if (Number(conteo.sin_sancion) > 0 && Number(conteo.en_turno) === 0) {
      /*
       * El caso más confuso de todos, y por eso lleva su propia línea: un
       * chofer SIN turnos asignados entra siempre, pero en cuanto se le asigna
       * uno solo entra dentro de su ventana. Asignarle un turno lo hace MENOS
       * disponible, que es lo contrario de lo que parece.
       */
      logger.warn(
        `Todos los choferes elegibles quedaron fuera por su turno (son las ${currentTime} ` +
          `del dia ${currentDow} en hora de Mexico, con domingo = 0). Un chofer sin turnos ` +
          'asignados entra siempre; uno con turnos solo entra dentro de su ventana. ' +
          'Revisa driver_shifts y driver_shift_assignments.',
      );
    }

    if (
      Number(conteo.en_turno) > 0 &&
      Number(conteo.sin_ofertar) === 0 &&
      yaNotificados.length > 0
    ) {
      logger.warn(
        `No quedan choferes nuevos a los que ofrecer este viaje: ya se le ofrecio a ` +
          `${yaNotificados.length} y ninguno lo tomo. No es falta de choferes.`,
      );
    }
  } catch (error: unknown) {
    logger.warn(
      `Sin choferes para el reparto${donde} y no se pudo diagnosticar por que: ${String(error)}`,
    );
  }
}
