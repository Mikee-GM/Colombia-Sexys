/**
 * Zona horaria y locale de la operacion.
 *
 * El negocio opera en Colombia. El backend formateaba y comparaba fechas en
 * `America/Mexico_City`, una hora por detras de Bogota, asi que toda hora que
 * salia hacia el cliente, hacia la empleada o hacia el modelo de IA iba
 * corrida. Peor aun donde se compara el *dia*: los cortes diarios y los plazos
 * de contenido semanal cambiaban de dia a las 23:00 hora de Bogota en lugar de
 * a medianoche.
 *
 * El commit c0e00d2 arreglo esto en el panel; el backend se quedo fuera.
 */
export const APP_TIME_ZONE = 'America/Bogota';
export const APP_LOCALE = 'es-CO';
