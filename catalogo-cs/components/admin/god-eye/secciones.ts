/**
 * Las piezas en las que se reparte el God Eye dentro del tablero.
 *
 * Vive en su propio modulo, sin `"use client"`, a proposito: la pagina del
 * centro de mando es un componente de servidor y necesita recorrer esta lista
 * para crear un bloque por seccion. De un modulo marcado como cliente el
 * servidor solo puede importar componentes --lo demas le llega como una
 * referencia opaca-- asi que importar el array desde `GodEyeDashboard.tsx`
 * compilaba y pasaba el `build`, pero al abrir la pagina reventaba con un
 * "SECCIONES_DEL_GOD_EYE.map is not a function".
 */
export const SECCIONES_DEL_GOD_EYE = [
  { nombre: "indicadores", titulo: "God Eye: indicadores" },
  { nombre: "actores", titulo: "God Eye: actores y expediente" },
  { nombre: "servicios", titulo: "God Eye: servicios y chat" },
  { nombre: "apelaciones", titulo: "God Eye: apelaciones" },
] as const;

export type NombreDeSeccion = (typeof SECCIONES_DEL_GOD_EYE)[number]["nombre"];
