import { Repository } from 'typeorm';
import { PushSubscriptionsService } from './push-subscriptions.service';
import { PushSubscription } from './entities/push-subscription.entity';

describe('PushSubscriptionsService', () => {
  it('da de alta por endpoint, de modo que un navegador no genere dos destinos', async () => {
    const query = jest.fn(() => Promise.resolve([]));
    const service = new PushSubscriptionsService({
      query,
    } as unknown as Repository<PushSubscription>);

    await service.registrar(
      'usuario-1',
      { endpoint: 'https://push.example/a', p256dh: 'clave', auth: 'secreto' },
      'Chrome en Android',
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
    const del = jest.fn(() => Promise.resolve({ affected: 0 }));
    const service = new PushSubscriptionsService({
      delete: del,
    } as unknown as Repository<PushSubscription>);

    await service.darDeBaja('usuario-1', 'https://push.example/ajeno');

    // Sin el usuario en el criterio, cualquiera que conociera un endpoint
    // podria dejar sin avisos el telefono de otro.
    expect(del).toHaveBeenCalledWith({
      usuarioId: 'usuario-1',
      endpoint: 'https://push.example/ajeno',
    });
  });
});
