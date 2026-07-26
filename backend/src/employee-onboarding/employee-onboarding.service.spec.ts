import { EmployeeOnboardingService } from './employee-onboarding.service';

describe('EmployeeOnboardingService', () => {
  const service = new EmployeeOnboardingService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  describe('calculateTrustScore', () => {
    it.each([
      [100, 1, 5],
      [80, 1, 4],
      [100, 2, 4],
      [80, 2, 3],
      [100, 4, 2],
      [20, 8, 1],
    ])(
      'uses score %i and %i attempt(s) to return trust %i',
      (bestScore, attemptCount, expected) => {
        expect(service.calculateTrustScore(bestScore, attemptCount)).toBe(
          expected,
        );
      },
    );
  });
});
