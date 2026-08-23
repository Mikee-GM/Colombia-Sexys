import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HttpThrottlerGuard } from './http-throttler.guard';

describe('HttpThrottlerGuard', () => {
  let increment: jest.Mock;
  let guard: HttpThrottlerGuard;

  const contextOfType = (type: string) =>
    ({
      getType: () => type,
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({
        getRequest: () => ({ ip: '10.0.0.1', headers: {} }),
        getResponse: () => ({ header: jest.fn() }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    increment = jest.fn().mockResolvedValue({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    guard = new HttpThrottlerGuard(
      { throttlers: [{ name: 'default', ttl: 60000, limit: 100 }] },
      { increment },
      new Reflector(),
    );
    await guard.onModuleInit();
  });

  it('no toca el almacenamiento en un contexto de Telegraf', async () => {
    // Sin esto el guard escribia cabeceras HTTP sobre el contexto de Telegraf y
    // cada update del bot moria con "res.header is not a function".
    await expect(guard.canActivate(contextOfType('telegraf'))).resolves.toBe(
      true,
    );
    expect(increment).not.toHaveBeenCalled();
  });

  it('sigue limitando las peticiones HTTP', async () => {
    await expect(guard.canActivate(contextOfType('http'))).resolves.toBe(true);
    expect(increment).toHaveBeenCalledTimes(1);
  });
});
