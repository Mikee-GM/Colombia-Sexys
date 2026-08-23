/**
 * Aritmetica de dinero en centavos enteros.
 *
 * Las columnas `numeric` de Postgres son exactas, pero al leerlas se convierten
 * a `number` de JavaScript, que es un flotante binario de doble precision. Sumar
 * decenas de importes en ese tipo acumula el error clasico de `0.1 + 0.2`, y
 * aqui lo que se suma es lo que se le paga a una persona.
 *
 * La regla de uso: convertir a centavos al entrar (`toCents`), operar siempre en
 * enteros, y volver a unidades solo al presentar o al guardar (`fromCents`).
 * Mientras el importe quepa en un entero seguro —unos 90 mil millones de pesos—
 * el resultado es exacto.
 */

/** Convierte un importe en unidades a centavos enteros. */
export function toCents(value: number | string | null | undefined): number {
  const parsed = typeof value === 'string' ? Number(value) : (value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  // El epsilon corrige los importes que ya llegan con error de flotante, para
  // que 12.005 no caiga al centavo de abajo por como se representa en binario.
  return Math.round((parsed + Number.EPSILON * Math.sign(parsed)) * 100);
}

/** Vuelve de centavos enteros a un importe en unidades con dos decimales. */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/** Suma una lista de importes sin perder precision por el camino. */
export function sumMoney(values: Array<number | string | null | undefined>) {
  return fromCents(values.reduce<number>((acc, v) => acc + toCents(v), 0));
}

/**
 * Multiplica un importe por un factor (un porcentaje, por ejemplo) y redondea
 * al centavo. Se hace sobre los centavos para que el redondeo sea uno solo.
 */
export function multiplyMoney(
  value: number | string | null | undefined,
  factor: number,
): number {
  return fromCents(Math.round(toCents(value) * factor));
}

/** Redondea un importe al centavo. */
export function roundMoney(value: number | string | null | undefined): number {
  return fromCents(toCents(value));
}
