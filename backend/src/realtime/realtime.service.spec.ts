import { RealtimeBus } from './realtime.bus';
import { RealtimeEventsService } from './realtime.service';

/** Bus que no habla con la base: aqui se comprueba la entrega local. */
function busDeMentira() {
  const publicados: unknown[] = [];
  const bus = {
    publicados,
    publish: (message: unknown) => {
      publicados.push(message);
      return Promise.resolve();
    },
    onRemoteMessage: jest.fn(),
  };
  return bus as unknown as RealtimeBus & { publicados: unknown[] };
}

describe('RealtimeEventsService', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('emits an immediate heartbeat and keeps the boss stream alive', () => {
    const service = new RealtimeEventsService(busDeMentira());
    const events: unknown[] = [];
    const subscription = service
      .getBossStream('boss-1')
      .subscribe((event) => events.push(event.data));

    jest.advanceTimersByTime(0);

    expect(events).toEqual([expect.objectContaining({ type: 'heartbeat' })]);
    subscription.unsubscribe();
  });

  it('delivers targeted changes only to the matching boss stream', () => {
    const service = new RealtimeEventsService(busDeMentira());
    const bossOneEvents: unknown[] = [];
    const bossTwoEvents: unknown[] = [];
    const first = service
      .getBossStream('boss-1')
      .subscribe((event) => bossOneEvents.push(event.data));
    const second = service
      .getBossStream('boss-2')
      .subscribe((event) => bossTwoEvents.push(event.data));

    service.emitToBoss('boss-1', { type: 'service_updated' });

    expect(bossOneEvents).toContainEqual({ type: 'service_updated' });
    expect(bossTwoEvents).not.toContainEqual({ type: 'service_updated' });
    first.unsubscribe();
    second.unsubscribe();
  });

  it('publica para las demás réplicas además de entregar en local', () => {
    const bus = busDeMentira();
    const service = new RealtimeEventsService(bus);
    const recibidos: unknown[] = [];
    const subscription = service
      .getBossStream('boss-1')
      .subscribe((event) => recibidos.push(event.data));

    service.emitToBoss('boss-1', { type: 'service_requested' });

    expect(recibidos).toContainEqual({ type: 'service_requested' });
    expect(bus.publicados).toEqual([
      { target: 'boss', key: 'boss-1', event: { type: 'service_requested' } },
    ]);
    subscription.unsubscribe();
  });

  it('entrega lo que llega de otra réplica a los canales locales', () => {
    const bus = busDeMentira();
    const service = new RealtimeEventsService(bus);
    service.onModuleInit();
    // El bus llama a lo que le registraron al arrancar.
    const entregar = (bus.onRemoteMessage as jest.Mock).mock.calls[0][0] as (
      m: unknown,
    ) => void;

    const recibidos: unknown[] = [];
    const subscription = service
      .getEmployeeStream('emp-1')
      .subscribe((event) => recibidos.push(event.data));

    entregar({ target: 'employee', key: 'emp-1', event: { type: 'remoto' } });

    expect(recibidos).toContainEqual({ type: 'remoto' });
    // Lo remoto no se vuelve a publicar: seria un bucle entre réplicas.
    expect(bus.publicados).toEqual([]);
    subscription.unsubscribe();
  });

  it('no entrega a un canal ajeno lo que llega de otra réplica', () => {
    const bus = busDeMentira();
    const service = new RealtimeEventsService(bus);
    service.onModuleInit();
    const entregar = (bus.onRemoteMessage as jest.Mock).mock.calls[0][0] as (
      m: unknown,
    ) => void;

    const recibidos: unknown[] = [];
    const subscription = service
      .getEmployeeStream('emp-1')
      .subscribe((event) => recibidos.push(event.data));

    entregar({ target: 'employee', key: 'emp-2', event: { type: 'remoto' } });

    expect(recibidos).not.toContainEqual({ type: 'remoto' });
    subscription.unsubscribe();
  });
});
