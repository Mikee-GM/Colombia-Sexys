import { botonesDePortal } from './telegram-portal-buttons';

/**
 * Telegram rechaza con un 400 el mensaje entero si un boton de Mini App apunta
 * a http. Con el origen mal configurado, la modelo se quedaba sin ningun
 * mensaje en vez de sin un boton.
 */
describe('botonesDePortal', () => {
  it('ofrece Mini App y navegador cuando el enlace es https', () => {
    const filas = botonesDePortal('https://panel.example.com/acceso/abc');

    expect(filas).toHaveLength(2);
    expect(filas[0][0]).toHaveProperty('web_app');
  });

  it('omite la Mini App si el enlace no es https, pero deja entrar', () => {
    const filas = botonesDePortal('http://localhost:3000/acceso/abc');

    expect(filas).toHaveLength(1);
    expect(filas[0][0]).toHaveProperty('url');
    expect(filas[0][0]).not.toHaveProperty('web_app');
  });

  it('no se deja engañar por el esquema en mayusculas', () => {
    expect(botonesDePortal('HTTPS://panel.example.com/x')).toHaveLength(2);
  });
});
