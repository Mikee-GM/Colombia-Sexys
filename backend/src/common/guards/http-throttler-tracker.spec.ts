import { HttpThrottlerGuard } from './http-throttler.guard';

/**
 * A quien se le cuenta cada peticion para el limite de ritmo.
 *
 * Contarlo por IP no servia aqui: el backend no esta publicado y el navegador
 * llega a el por el proxy del frontend, asi que TODO el trafico web sale de la
 * misma direccion. El limite global se repartia entre todos los usuarios
 * juntos, y los cinco intentos de login por minuto eran cinco para toda la
 * empresa: fallando cinco veces a proposito se dejaba a los demas sin entrar.
 */
describe('HttpThrottlerGuard: a quién se le cuenta', () => {
  const guard = Object.create(HttpThrottlerGuard.prototype) as {
    getTracker: (req: Record<string, unknown>) => Promise<string>;
  };

  it('cuenta el login por cuenta, no por origen', async () => {
    await expect(
      guard.getTracker({ body: { email: 'Ana@Ejemplo.com ' }, ip: '10.0.0.1' }),
    ).resolves.toBe('cuenta:ana@ejemplo.com');
  });

  /** Dos personas fallando su propio login no se estorban entre si. */
  it('separa a dos cuentas distintas aunque vengan del mismo sitio', async () => {
    const una = await guard.getTracker({
      body: { email: 'ana@ejemplo.com' },
      ip: '10.0.0.1',
    });
    const otra = await guard.getTracker({
      body: { email: 'luis@ejemplo.com' },
      ip: '10.0.0.1',
    });

    expect(una).not.toBe(otra);
  });

  it('cuenta por sesión cuando hay cookie de acceso', async () => {
    const tracker = await guard.getTracker({
      signedCookies: { access_token: 'un-token' },
      ip: '10.0.0.1',
    });

    expect(tracker.startsWith('sesion:')).toBe(true);
    // La huella, no el token: aqui no se decide ningun permiso.
    expect(tracker).not.toContain('un-token');
  });

  it('da cubos distintos a dos sesiones del mismo origen', async () => {
    const una = await guard.getTracker({
      signedCookies: { access_token: 'token-de-ana' },
      ip: '10.0.0.1',
    });
    const otra = await guard.getTracker({
      signedCookies: { access_token: 'token-de-luis' },
      ip: '10.0.0.1',
    });

    expect(una).not.toBe(otra);
  });

  it('cae a la IP con el tráfico anónimo', async () => {
    await expect(guard.getTracker({ ip: '203.0.113.9' })).resolves.toBe(
      'ip:203.0.113.9',
    );
  });

  it('no revienta sin IP ni cookies', async () => {
    await expect(guard.getTracker({})).resolves.toBe('ip:desconocida');
  });
});
