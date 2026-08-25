/**
 * Normaliza una respuesta de listado a un array.
 *
 * Algunos endpoints del backend responden paginado (`{ items, total, limit,
 * offset }`) y otros devuelven el array pelado. Consumir el objeto como si
 * fuera lista no falla al asignarlo: revienta despues, al iterarlo, con un
 * "no es iterable" o un ".map is not a function" que apunta al componente y no
 * a la peticion. Este helper corta ese problema en la frontera de datos.
 */
export function asList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object" && Array.isArray((value as { items?: unknown }).items)) {
    return (value as { items: T[] }).items;
  }
  return [];
}
