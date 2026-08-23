import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

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
}
