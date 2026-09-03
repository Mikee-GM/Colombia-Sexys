/**
 * Nombre legible de cada zona de viaje.
 *
 * Vive aparte del portal porque la pantalla del viaje en curso lo necesita
 * igual, y duplicarlo garantizaba que una zona nueva apareciera con su clave
 * cruda en una de las dos.
 */
export const ZONA_LABEL: Record<string, string> = {
  montecarlo: "Montecarlo",
  majestic: "Majestic",
  domicilio: "Domicilio",
};
