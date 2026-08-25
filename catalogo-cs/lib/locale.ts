/**
 * Configuracion regional unica de la aplicacion.
 *
 * El negocio se opera desde Mexico, aunque las modelos del catalogo sean
 * colombianas: el dinero se cobra y se liquida en pesos mexicanos y la agenda
 * corre en hora de Ciudad de Mexico. Existe este modulo unico porque varias
 * vistas fijaban su propia zona horaria por su cuenta, y basta una diferencia
 * de una hora para que la disponibilidad de una modelo se muestre corrida.
 */
export const APP_TIME_ZONE = "America/Mexico_City";

export const APP_LOCALE = "es-MX";
