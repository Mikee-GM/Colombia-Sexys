import { AuthCleanupScheduler } from './auth-cleanup.scheduler';

/**
 * El barrido corre en cada replica del backend, asi que lo que se comprueba es
 * que no se pise a si mismo ni tumbe el proceso si la base falla.
 */
describe('AuthCleanupScheduler', () => {
  const panelAccessService = { purgeExpired: jest.fn() };
  const authService = { purgeStaleSessions: jest.fn() };

  /*
   * Ejecuta la tarea como si esta replica hubiera ganado el advisory lock. No
   * es un jest.fn a proposito: `clearAllMocks` entre pruebas no debe poder
   * dejar al runner sin implementacion.
   */
  const dataSource = {
    createQueryRunner: () => ({
      connect: () => Promise.resolve(),
      release: () => Promise.resolve(),
      query: (sql: string) =>
        Promise.resolve(
          sql.includes('pg_try_advisory_lock') ? [{ locked: true }] : [],
        ),
    }),
  };

  /*
   * Se construye por nombre y no con `new`.
   *
   * Con la lista posicional, cada dependencia nueva del servicio desplazaba todos
   * los dobles y estas pruebas fallaban por un motivo ajeno a lo que probaban.
   * Los campos inicializados de la clase entran como dobles porque
   * `Object.create` no los ejecuta.
   */
  const scheduler = Object.create(
    AuthCleanupScheduler.prototype,
  ) as AuthCleanupScheduler;
  Object.assign(scheduler, {
    logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
    panelAccessService,
    authService,
    dataSource,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    panelAccessService.purgeExpired.mockResolvedValue(3);
    authService.purgeStaleSessions.mockResolvedValue(120);
  });

  it('barre pases caducados y sesiones viejas en cada ciclo', async () => {
    await scheduler.runCycle();

    expect(panelAccessService.purgeExpired).toHaveBeenCalledTimes(1);
    expect(authService.purgeStaleSessions).toHaveBeenCalledTimes(1);
  });

  it('no barre sesiones si el barrido de pases falla; lo reintenta el ciclo siguiente', async () => {
    panelAccessService.purgeExpired.mockRejectedValueOnce(
      new Error('sin base'),
    );

    await scheduler.runCycle();
    expect(authService.purgeStaleSessions).not.toHaveBeenCalled();

    await scheduler.runCycle();
    expect(authService.purgeStaleSessions).toHaveBeenCalledTimes(1);
  });

  it('no arranca un ciclo encima de otro que sigue corriendo', async () => {
    let liberar: () => void = () => undefined;
    panelAccessService.purgeExpired.mockReturnValue(
      new Promise<number>((resolve) => {
        liberar = () => resolve(0);
      }),
    );

    const primero = scheduler.runCycle();
    /* El primer ciclo cede varias veces antes de llegar al borrado. */
    await new Promise((resolve) => setImmediate(resolve));

    await scheduler.runCycle();

    expect(panelAccessService.purgeExpired).toHaveBeenCalledTimes(1);

    liberar();
    await primero;
  });

  it('registra el fallo sin propagarlo, para no tumbar el temporizador', async () => {
    panelAccessService.purgeExpired.mockRejectedValue(new Error('sin base'));

    await expect(scheduler.runCycle()).resolves.toBeUndefined();
  });

  it('vuelve a correr despues de un ciclo fallido', async () => {
    panelAccessService.purgeExpired.mockRejectedValueOnce(
      new Error('sin base'),
    );

    await scheduler.runCycle();
    await scheduler.runCycle();

    expect(panelAccessService.purgeExpired).toHaveBeenCalledTimes(2);
  });
});
