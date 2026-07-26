import {
  estimateServiceEnd,
  estimateTravelMinutes,
} from './service-scheduling';

describe('service scheduling estimates', () => {
  it('recalculates availability from the full extended duration', () => {
    const start = new Date('2026-07-22T18:00:00.000Z');
    expect(estimateServiceEnd(start, 3)?.toISOString()).toBe(
      '2026-07-22T21:00:00.000Z',
    );
    expect(estimateServiceEnd(start, 5)?.toISOString()).toBe(
      '2026-07-22T23:00:00.000Z',
    );
  });

  it('uses the configurable preparation margin at the same coordinates', () => {
    expect(
      estimateTravelMinutes(
        { latitude: 19.432608, longitude: -99.133209 },
        { latitude: 19.432608, longitude: -99.133209 },
        25,
        10,
      ),
    ).toBe(10);
  });

  it('increases the ETA when the destination is farther away', () => {
    const near = estimateTravelMinutes(
      { latitude: 19.432608, longitude: -99.133209 },
      { latitude: 19.44, longitude: -99.14 },
    );
    const far = estimateTravelMinutes(
      { latitude: 19.432608, longitude: -99.133209 },
      { latitude: 19.55, longitude: -99.25 },
    );
    expect(far).toBeGreaterThan(near);
  });
});
