/**
 * Calculos geograficos en memoria.
 *
 * La costumbre de la casa es dejar los agregados a PostgreSQL --y para eso
 * existe `calcular_distancia_haversine`--, pero estas cuentas deciden si vale
 * la pena consultar a la base: preguntarle a PostgreSQL si hay que preguntarle
 * a PostgreSQL no tendria sentido. Vive aqui, y no repetida en cada servicio,
 * porque cuando habia una copia por modulo bastaba con tocar una para que la
 * misma distancia diera distinto segun quien la midiera.
 */

const RADIO_TIERRA_M = 6371000;

const aRadianes = (grados: number): number => (grados * Math.PI) / 180;

/** Distancia en metros entre dos puntos, por la formula de Haversine. */
export function metrosEntre(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = aRadianes(lat2 - lat1);
  const dLng = aRadianes(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRadianes(lat1)) *
      Math.cos(aRadianes(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return RADIO_TIERRA_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** La misma distancia, en kilometros. */
export function kilometrosEntre(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  return metrosEntre(lat1, lng1, lat2, lng2) / 1000;
}
