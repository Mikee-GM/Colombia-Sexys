import { Markup } from 'telegraf';
import type { InlineKeyboardButton } from 'telegraf/types';

/**
 * Botonera para abrir un portal desde Telegram.
 *
 * El boton de Mini App solo se ofrece cuando el enlace es https: Telegram
 * rechaza la peticion entera con un 400 si una Web App apunta a http, asi que
 * un origen mal configurado no tumbaba solo el boton, dejaba a la modelo sin
 * ningun mensaje. El boton de navegador si admite http, y con el al menos se
 * puede entrar mientras se corrige la configuracion.
 */
export function botonesDePortal(
  url: string,
  /** Texto del boton. Se personaliza cuando el pase aterriza en una seccion concreta. */
  etiqueta = 'Abrir mi portal',
): InlineKeyboardButton[][] {
  const esSeguro = url.toLowerCase().startsWith('https://');

  return [
    ...(esSeguro ? [[Markup.button.webApp(etiqueta, url)]] : []),
    [Markup.button.url('Abrir en el navegador', url)],
  ];
}
