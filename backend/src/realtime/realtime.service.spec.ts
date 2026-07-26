import { RealtimeEventsService } from './realtime.service';

describe('RealtimeEventsService', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('emits an immediate heartbeat and keeps the boss stream alive', () => {
    const service = new RealtimeEventsService();
    const events: unknown[] = [];
    const subscription = service
      .getBossStream('boss-1')
      .subscribe((event) => events.push(event.data));

    jest.advanceTimersByTime(0);

    expect(events).toEqual([expect.objectContaining({ type: 'heartbeat' })]);
    subscription.unsubscribe();
  });

  it('delivers targeted changes only to the matching boss stream', () => {
    const service = new RealtimeEventsService();
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
});
