import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'crypto';
import { ACCESS_COOKIE } from '../../auth/auth.constants';

/**
 * `ThrottlerGuard` limitado al transporte HTTP.
 *
 * El guard global no solo cubre los controladores: `nestjs-telegraf` ejecuta
 * cada handler de Telegram por el mismo pipeline de Nest, asi que los updates
 * del bot tambien pasaban por el throttler. Ahi no hay peticion HTTP —
 * `switchToHttp()` devuelve el contexto de Telegraf— y el guard reventaba al
 * escribir las cabeceras `X-RateLimit-*` con `res.header is not a function`,
 * tumbando cada mensaje que llegaba a los bots.
 *
 * El limite por IP no significa nada para un update de Telegram (todos llegan
 * por la misma conexion), de modo que el contexto no-HTTP se salta entero. El
 * abuso desde Telegram se controla aparte, por telegram_id, en la tabla de
 * intentos de vinculacion.
 */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  protected shouldSkip(context: ExecutionContext): Promise<boolean> {
    return Promise.resolve(context.getType() !== 'http');
  }

  /**
   * A quien se le cuenta cada peticion.
   *
   * Por defecto se cuenta por IP, y aqui eso significaba contarselo todo a la
   * misma: el backend no esta publicado, el navegador llega a el por el proxy
   * del frontend, y desde el punto de vista de Nest TODO el trafico web sale de
   * la misma direccion --la del contenedor de Next--. Con lo cual el limite
   * global de 100 por minuto se repartia entre todos los usuarios del panel
   * juntos, y los cinco intentos de login por minuto eran cinco para toda la
   * empresa: cualquiera podia dejar a los demas sin poder entrar fallando cinco
   * veces a proposito.
   *
   * Se cuenta, por orden:
   *
   *  1. Por cuenta cuando la peticion trae un email --el login--, que es lo que
   *     de verdad hay que frenar en la fuerza bruta y ademas no deja que un
   *     desconocido bloquee la entrada de nadie mas.
   *  2. Por sesion cuando hay cookie de acceso, para que cada usuario tenga su
   *     propio cupo. Se identifica por la huella del token, no por su
   *     contenido: aqui no se decide ningun permiso, solo a que cubo sumar.
   *  3. Por IP en lo que queda, que es lo unico que hay para el trafico
   *     anonimo.
   */
  protected getTracker(req: Record<string, any>): Promise<string> {
    const cuerpo = req?.body as { email?: unknown } | undefined;
    if (typeof cuerpo?.email === 'string' && cuerpo.email.trim()) {
      return Promise.resolve(`cuenta:${cuerpo.email.trim().toLowerCase()}`);
    }

    const cookies = req?.signedCookies as Record<string, string> | undefined;
    const acceso = cookies?.[ACCESS_COOKIE];
    if (typeof acceso === 'string' && acceso) {
      const huella = createHash('sha256')
        .update(acceso)
        .digest('hex')
        .slice(0, 32);
      return Promise.resolve(`sesion:${huella}`);
    }

    const ip = (req?.ip as string) || 'desconocida';
    return Promise.resolve(`ip:${ip}`);
  }
}
