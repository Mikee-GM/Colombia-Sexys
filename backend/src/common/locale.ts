/**
 * Zona horaria y locale de la operacion.
 *
 * El negocio se opera desde Mexico, aunque las modelos sean colombianas. La
 * zona importa sobre todo donde se compara el *dia*: los cortes diarios y los
 * plazos de contenido semanal tienen que cambiar de dia a medianoche hora de
 * Ciudad de Mexico, no a otra hora.
 */
export const APP_TIME_ZONE = 'America/Mexico_City';
export const APP_LOCALE = 'es-MX';
