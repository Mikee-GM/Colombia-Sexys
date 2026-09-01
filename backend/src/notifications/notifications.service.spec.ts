import { Repository } from 'typeorm';
import { NotificationsService } from './notifications.service';
import { PushSubscriptionsService } from './push-subscriptions.service';
import { PushSubscription } from './entities/push-subscription.entity';
import { Servicios } from '../services/entities/service.entity';
import { ResultadoEnvio, WebPushProvider } from './web-push.provider';

function destino(id: string): PushSubscription {
  return {
    id,
    endpoint: `https://push.example/${id}`,
    p256dh: 'clave',
    auth: 'secreto',
  } as PushSubscription;
}

/**
 * Proveedor que responde lo que le digan, sin salir a la red. Lo que se
 * comprueba en cada caso es como reacciona el servicio al resultado, no el
 * protocolo de push.
 *
 * Devuelve los dobles sueltos ademas del objeto: leerlos despues como
 * `proveedor.enviar` seria acceder a un metodo desligado de su objeto, que es
 * justo lo que la regla `unbound-method` prohibe.
 */
function proveedorDeMentira(
  respuestas: Record<string, ResultadoEnvio>,
  configurado = true,
) {
  const enviar = jest.fn((d: { endpoint: string }) =>
    Promise.resolve(respuestas[d.endpoint] ?? { estado: 'enviado' }),
  );
  const proveedor = {
    estaConfigurado: () => configurado,
    clavePublica: () => 'publica',
    enviar,
  } as unknown as WebPushProvider;
  return { proveedor, enviar };
}

function suscripcionesDeMentira(destinos: PushSubscription[]) {
  const listarDe = jest.fn(() => Promise.resolve(destinos));
  const olvidar = jest.fn(() => Promise.resolve());
  const marcarEnvio = jest.fn(() => Promise.resolve());
  const marcarFallo = jest.fn(() => Promise.resolve());
  const suscripciones = {
    listarDe,
    olvidar,
    marcarEnvio,
    marcarFallo,
  } as unknown as PushSubscriptionsService;
  return { suscripciones, listarDe, olvidar, marcarEnvio, marcarFallo };
}

const serviciosVacio = {} as Repository<Servicios>;

/**
 * Arma el servicio por nombre y no con `new`.
 *
 * Con la lista posicional, cada dependencia nueva desplazaba todos los dobles y
 * las pruebas fallaban por un motivo ajeno a lo que probaban. El registro entra
 * como doble porque `Object.create` no ejecuta los campos inicializados.
 */
function servicioCon(partes: Record<string, unknown>): NotificationsService {
  const service = Object.create(
    NotificationsService.prototype,
  ) as NotificationsService;
  Object.assign(service, {
    logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
    servicios: serviciosVacio,
    // Sin ajuste guardado se manda todo, que es el caso por defecto.
    preferences: { get: jest.fn().mockResolvedValue(null) },
    ...partes,
  });
  return service;
}

describe('NotificationsService', () => {
  const aviso = { titulo: 'Titulo', cuerpo: 'Cuerpo', url: '/jefe' };

  it('avisa a todos los dispositivos del usuario, no solo al primero', async () => {
    const { proveedor, enviar } = proveedorDeMentira({});
    const { suscripciones } = suscripcionesDeMentira([
      destino('a'),
      destino('b'),
      destino('c'),
    ]);
    const service = Object.create(
      NotificationsService.prototype,
    ) as NotificationsService;
    Object.assign(service, {
      logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
      webPush: proveedor,
      suscripciones,
      servicios: serviciosVacio,
      // Sin ajuste guardado se manda todo, que es el caso por defecto.
      preferences: { get: jest.fn().mockResolvedValue(null) },
    });

    const enviados = await service.notificar('usuario-1', aviso);

    expect(enviados).toBe(3);
    expect(enviar).toHaveBeenCalledTimes(3);
  });

  it('borra la suscripcion caducada y sigue avisando a las demas', async () => {
    const { proveedor } = proveedorDeMentira({
      'https://push.example/muerta': { estado: 'caducado' },
    });
    const { suscripciones, olvidar } = suscripcionesDeMentira([
      destino('viva'),
      destino('muerta'),
    ]);
    const service = Object.create(
      NotificationsService.prototype,
    ) as NotificationsService;
    Object.assign(service, {
      logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
      webPush: proveedor,
      suscripciones,
      servicios: serviciosVacio,
      // Sin ajuste guardado se manda todo, que es el caso por defecto.
      preferences: { get: jest.fn().mockResolvedValue(null) },
    });

    const enviados = await service.notificar('usuario-1', aviso);

    expect(enviados).toBe(1);
    expect(olvidar).toHaveBeenCalledWith('https://push.example/muerta');
  });

  it('anota el fallo pasajero sin borrar el dispositivo', async () => {
    const { proveedor } = proveedorDeMentira({
      'https://push.example/intermitente': {
        estado: 'error',
        motivo: 'timeout',
      },
    });
    const { suscripciones, olvidar, marcarFallo } = suscripcionesDeMentira([
      destino('intermitente'),
    ]);
    const service = Object.create(
      NotificationsService.prototype,
    ) as NotificationsService;
    Object.assign(service, {
      logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
      webPush: proveedor,
      suscripciones,
      servicios: serviciosVacio,
      // Sin ajuste guardado se manda todo, que es el caso por defecto.
      preferences: { get: jest.fn().mockResolvedValue(null) },
    });

    const enviados = await service.notificar('usuario-1', aviso);

    expect(enviados).toBe(0);
    expect(marcarFallo).toHaveBeenCalledWith('intermitente');
    expect(olvidar).not.toHaveBeenCalled();
  });

  it('sin claves VAPID no lanza ni consulta la base', async () => {
    const { proveedor } = proveedorDeMentira({}, false);
    const { suscripciones, listarDe } = suscripcionesDeMentira([destino('a')]);
    const service = Object.create(
      NotificationsService.prototype,
    ) as NotificationsService;
    Object.assign(service, {
      logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
      webPush: proveedor,
      suscripciones,
      servicios: serviciosVacio,
      // Sin ajuste guardado se manda todo, que es el caso por defecto.
      preferences: { get: jest.fn().mockResolvedValue(null) },
    });

    await expect(service.notificar('usuario-1', aviso)).resolves.toBe(0);
    expect(listarDe).not.toHaveBeenCalled();
  });

  it('el aviso del servicio pendiente no revela datos del cliente', async () => {
    const { proveedor, enviar } = proveedorDeMentira({});
    const { suscripciones } = suscripcionesDeMentira([destino('a')]);
    const servicios = {
      findOne: jest.fn(() =>
        Promise.resolve({ id: 'servicio-1', jefeId: 'jefe-1' }),
      ),
    } as unknown as Repository<Servicios>;
    const service = Object.create(
      NotificationsService.prototype,
    ) as NotificationsService;
    Object.assign(service, {
      logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
      webPush: proveedor,
      suscripciones,
      servicios,
      preferences: { get: jest.fn().mockResolvedValue(null) },
    });

    await service.notificarJefeServicioPendiente('servicio-1');

    const carga = enviar.mock.calls[0][1] as unknown as Record<string, unknown>;
    expect(carga.titulo).toBe('Servicio pendiente de autorizar');
    // El aviso se lee en la pantalla de bloqueo: solo dice que hay algo que
    // autorizar, nunca de quien ni por cuanto.
    expect(JSON.stringify(carga)).not.toMatch(/cliente|empleada|\$/i);
  });

  /*
   * El ajuste solo puede silenciar lo que se declara silenciable. Si un aviso
   * de nivel 1 --uno que la operacion necesita que llegue-- se pudiera apagar
   * desde una pantalla, el sistema dejaria de funcionar sin que nadie supiera
   * por que.
   */
  it('no manda un aviso opcional que la persona apago', async () => {
    const { proveedor, enviar } = proveedorDeMentira({});
    const { suscripciones } = suscripcionesDeMentira([destino('a')]);
    const service = servicioCon({
      webPush: proveedor,
      suscripciones,
      preferences: {
        get: jest.fn().mockResolvedValue({ liquidacion: false }),
      },
    });

    const enviados = await service.notificar('usuario-1', {
      ...aviso,
      tipo: 'liquidacion',
    });

    expect(enviados).toBe(0);
    expect(enviar).not.toHaveBeenCalled();
  });

  it('manda igual un aviso sin tipo, que es el que no se puede apagar', async () => {
    const { proveedor, enviar } = proveedorDeMentira({});
    const { suscripciones } = suscripcionesDeMentira([destino('a')]);
    const service = servicioCon({
      webPush: proveedor,
      suscripciones,
      preferences: {
        get: jest.fn().mockResolvedValue({ liquidacion: false }),
      },
    });

    await service.notificar('usuario-1', aviso);

    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('manda cuando la consulta del ajuste falla: perder un aviso es peor', async () => {
    const { proveedor, enviar } = proveedorDeMentira({});
    const { suscripciones } = suscripcionesDeMentira([destino('a')]);
    const service = servicioCon({
      webPush: proveedor,
      suscripciones,
      preferences: {
        get: jest.fn().mockRejectedValue(new Error('base caida')),
      },
    });

    await service.notificar('usuario-1', { ...aviso, tipo: 'liquidacion' });

    expect(enviar).toHaveBeenCalledTimes(1);
  });
});
