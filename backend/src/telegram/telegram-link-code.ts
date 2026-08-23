import { createHash, randomInt } from 'crypto';

/** Cuantos digitos tiene el codigo que el usuario teclea en Telegram. */
const CODE_DIGITS = 6;

/**
 * Genera el codigo de vinculacion.
 *
 * `randomInt` de `crypto` en vez de `Math.random()`: el segundo es un generador
 * predecible, y de un codigo que da acceso a una cuenta no puede adivinarse la
 * siguiente tirada a partir de las anteriores.
 */
export function generateLinkCode(): string {
  return randomInt(0, 10 ** CODE_DIGITS)
    .toString()
    .padStart(CODE_DIGITS, '0');
}

/**
 * Huella del codigo, que es lo unico que se guarda.
 *
 * En la base solo vive el hash: si la tabla se filtra, el codigo en claro no
 * viaja con ella. El espacio es pequeño —un millon de combinaciones— asi que el
 * hash no protege frente a fuerza bruta *offline*; para eso esta el limite de
 * intentos y la caducidad de diez minutos. Lo que si evita es que un volcado de
 * la tabla sea directamente utilizable.
 *
 * SHA-256 y no bcrypt a proposito: la comprobacion ocurre en cada `/vincular` y
 * tiene que ser una busqueda por indice, no un recorrido de la tabla probando
 * hashes uno a uno.
 */
export function hashLinkCode(code: string): string {
  return createHash('sha256').update(code.trim()).digest('hex');
}
