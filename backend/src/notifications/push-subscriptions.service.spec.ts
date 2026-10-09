import { Repository } from 'typeorm';
import {
  PushSubscriptionsService,
  resumirUserAgent,
} from './push-subscriptions.service';
import { PushSubscription } from './entities/push-subscription.entity';

describe('PushSubscriptionsService', () => {
  it('da de alta por endpoint, de modo que un navegador no genere dos destinos', async () => {
    const query = jest.fn((_sql: string, _params?: unknown[]) =>
      Promise.resolve([]),
    );
    const service = new PushSubscriptionsService({
      query,
    } as unknown as Repository<PushSubscription>);

    await service.registrar(
      'usuario-1',
      { endpoint: 'https://push.example/a', p256dh: 'clave', auth: 'secreto' },
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0.0.0',
    );

    const [sql, parametros] = query.mock.calls[0] as [string, unknown[]];
    // El upsert va por endpoint: si fuera por usuario, cada renovacion de la
    // suscripcion dejaria una fila mas y el mismo telefono recibiria repetidos.
    expect(sql).toMatch(/ON CONFLICT \(endpoint\)/);
    expect(parametros).toEqual([
      'usuario-1',
      'https://push.example/a',
      'clave',
      'secreto',
      'Chrome en Android',
    ]);
  });

  it('la baja se acota al usuario de la sesion', async () => {
    const update = jest.fn(() => Promise.resolve({ affected: 0 }));
    const service = new PushSubscriptionsService({
      update,
    } as unknown as Repository<PushSubscription>);

    await service.darDeBaja('usuario-1', 'https://push.example/ajeno');

    // Sin el usuario en el criterio, cualquiera que conociera un endpoint
    // podria dejar sin avisos el telefono de otro.
    expect(update).toHaveBeenCalledWith(
      {
        usuarioId: 'usuario-1',
        endpoint: 'https://push.example/ajeno',
      },
      expect.objectContaining({ habilitada: false }),
    );
  });

  it('desactiva un endpoint 410 sin borrar el historial del dispositivo', async () => {
    const update = jest.fn(() => Promise.resolve({ affected: 1 }));
    const service = new PushSubscriptionsService({
      update,
    } as unknown as Repository<PushSubscription>);

    await service.olvidar('https://push.example/caducado');

    expect(update).toHaveBeenCalledWith(
      { endpoint: 'https://push.example/caducado' },
      expect.objectContaining({ habilitada: false }),
    );
  });

  it('resume el user-agent y no conserva la huella completa', () => {
    expect(
      resumirUserAgent(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro Build/UQ1A.240205) AppleWebKit/537.36 Chrome/124.0.0.0',
      ),
    ).toBe('Chrome en Android');
  });

  it('incrementa el fallo y devuelve el contador de forma atomica', async () => {
    const query = jest.fn().mockResolvedValue([{ fallos: 3 }]);
    const service = new PushSubscriptionsService({
      query,
    } as unknown as Repository<PushSubscription>);

    await expect(service.marcarFallo('subscription-1')).resolves.toBe(3);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('RETURNING fallos'),
      ['subscription-1'],
    );
  });
});
