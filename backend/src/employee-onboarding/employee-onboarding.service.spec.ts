import { EmployeeOnboardingService } from './employee-onboarding.service';

describe('EmployeeOnboardingService', () => {
  /*
   * Se construye por nombre y no con `new`.
   *
   * Con la lista posicional, cada dependencia nueva del servicio desplazaba todos
   * los dobles y estas pruebas fallaban por un motivo ajeno a lo que probaban.
   * Los campos inicializados de la clase entran como dobles porque
   * `Object.create` no los ejecuta.
   */
  const service = Object.create(
    EmployeeOnboardingService.prototype,
  ) as EmployeeOnboardingService;
  Object.assign(service, {
    regulationRepository: {},
    questionRepository: {},
    optionRepository: {},
    onboardingRepository: {},
    attemptRepository: {},
    answerRepository: {},
    employeeRepository: {},
    userRepository: {},
    dataSource: {},
  });

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
