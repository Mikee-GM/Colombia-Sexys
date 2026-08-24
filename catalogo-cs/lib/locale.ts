/**
 * Configuracion regional unica de la aplicacion.
 *
 * La operacion es colombiana. Varias vistas fijaban por su cuenta la zona
 * horaria de Ciudad de Mexico, que va una hora detras de Bogota, de modo que
 * las horas mostradas en los portales y en la disponibilidad de las modelos
 * quedaban corridas.
 */
export const APP_TIME_ZONE = "America/Bogota";

export const APP_LOCALE = "es-CO";
