import { APP_TIME_ZONE } from '../common/locale';

/**
 * La condición de turno del reparto de choferes, en un solo sitio.
 *
 * Vivía escrita a mano dentro de `dispatchViaje`. Cuando hubo que repetirla en
 * el diagnóstico de "no hay choferes disponibles", copiarla habría dejado dos
 * versiones de la parte más delicada de todo esto --los turnos que cruzan la
 * medianoche-- y la copia del diagnóstico habría acabado mintiendo sobre lo que
 * hace la de verdad.
 */

/** El ahora del negocio, en las piezas que pide la consulta. */
export type MomentoDeTurno = {
  /** Hora local en formato `HH:mm`, que es como se guardan los turnos. */
  currentTime: string;
  /** Día de la semana, 0 = domingo, como `days_of_week`. */
  currentDow: number;
  /** El de ayer, para los turnos que empezaron anoche y siguen abiertos. */
  yesterdayDow: number;
};

/**
 * Calcula ese momento en la zona del negocio.
 *
 * Se saca de `Intl.DateTimeFormat` y no de reinterpretar una fecha con
 * `toLocaleString`: esa forma depende de que el servidor sepa parsear de vuelta
 * la cadena que acaba de formatear, y el resultado cambia con la configuración
 * regional de la máquina. Las piezas que hacen falta son tres números, así que
 * es más corto pedirlos directamente.
 */
export function momentoDeTurno(ahora: Date = new Date()): MomentoDeTurno {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(ahora);

  const valor = (tipo: string) =>
    partes.find((parte) => parte.type === tipo)?.value ?? '';

  const dias = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const currentDow = Math.max(0, dias.indexOf(valor('weekday')));
  // A medianoche `hour` sale como "24" en algunos entornos con hour12: false.
  const hora = valor('hour') === '24' ? '00' : valor('hour');

  return {
    currentTime: `${hora}:${valor('minute')}`,
    currentDow,
    yesterdayDow: (currentDow + 6) % 7,
  };
}

/**
 * El SQL que decide si un chofer está dentro de un turno suyo ahora mismo.
 *
 * Un chofer SIN ningún turno asignado es elegible siempre: es lo que mantiene
 * funcionando a quien no usa el sistema de turnos. Uno que sí los tiene solo
 * entra dentro de su ventana, y eso incluye los turnos que cruzan la medianoche
 * --`starts_at > ends_at`--, que cuentan contra el día de ayer.
 *
 * `alias` es el de la tabla `choferes` en la consulta que lo use.
 */
export function sqlTurnoVigente(alias: string): string {
  return `(
    NOT EXISTS (SELECT 1 FROM driver_shift_assignments dsa WHERE dsa.driver_id = ${alias}.id)
    OR EXISTS (
      SELECT 1 FROM driver_shift_assignments dsa
      JOIN driver_shifts ds ON ds.id = dsa.shift_id
      WHERE dsa.driver_id = ${alias}.id
        AND ds.active = true
        AND (
          (ds.starts_at <= ds.ends_at
            AND :currentTime BETWEEN ds.starts_at AND ds.ends_at
            AND :currentDow = ANY(ds.days_of_week))
          OR
          (ds.starts_at > ds.ends_at
            AND (
              (:currentTime >= ds.starts_at AND :currentDow = ANY(ds.days_of_week))
              OR
              (:currentTime <= ds.ends_at AND :yesterdayDow = ANY(ds.days_of_week))
            ))
        )
    )
  )`;
}

/**
 * Lo mismo pero con marcadores numerados, para `dataSource.query`.
 *
 * El query builder acepta `:nombre`; la consulta suelta, no. Los índices se
 * pasan para poder encadenarlos detrás de otros parámetros.
 */
export function sqlTurnoVigenteNumerado(
  alias: string,
  indices: { currentTime: number; currentDow: number; yesterdayDow: number },
): string {
  return sqlTurnoVigente(alias)
    .replace(/:currentTime/g, `$${indices.currentTime}`)
    .replace(/:currentDow/g, `$${indices.currentDow}`)
    .replace(/:yesterdayDow/g, `$${indices.yesterdayDow}`);
}
