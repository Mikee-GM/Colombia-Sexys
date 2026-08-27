import { WeeklyContentScheduler } from './weekly-content.scheduler';

/**
 * Lo que se protege aqui es el conteo de avisos y la multa.
 *
 * El ciclo anterior mandaba un unico recordatorio y abria un reporte que nadie
 * miraba. Ahora la modelo tiene tres oportunidades y una consecuencia concreta,
 * asi que las dos cosas que no pueden fallar son que el contador no se pase del
 * tope y que la multa no se cobre dos veces.
 */
describe('WeeklyContentScheduler', () => {
  const SEMANA = '2026-08-21';

  const weeklyContentService = {
    getCurrentCycleFriday: () => SEMANA,
    getFinePolicy: jest.fn(),
  };
  const telegramService = { sendMessage: jest.fn() };
  const panelAccessService = { issueLink: jest.fn() };
  const scheduleRepo = { find: jest.fn(), findOne: jest.fn(), save: jest.fn(), create: jest.fn() };
  const empleadasRepo = { find: jest.fn() };
  const conductReportRepo = { save: jest.fn(), create: jest.fn((valor) => valor) };
  const dataSource = { query: jest.fn() };

  const scheduler = new WeeklyContentScheduler(
    { get: () => '' } as any,
    weeklyContentService as any,
    telegramService as any,
    panelAccessService as any,
    scheduleRepo as any,
    empleadasRepo as any,
    conductReportRepo as any,
    dataSource as any,
  );

  /** Ciclo pendiente de una modelo con chat vinculado. */
  const pendiente = (overrides: Record<string, unknown> = {}) => ({
    id: 'sched-1',
    empleadaId: 'emp-1',
    semanaInicio: SEMANA,
    estado: 'solicitado',
    recordatoriosEnviados: 0,
    recordatorioAt: null,
    multaAplicadaAt: null,
    multaLiquidationRecordId: null,
    empleada: {
      nombreArtistico: 'Modelo',
      usuario: { id: 'user-1', telegramChatId: '555' },
    },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    weeklyContentService.getFinePolicy.mockResolvedValue({
      maxRecordatorios: 3,
      importeMulta: 300,
    });
    panelAccessService.issueLink.mockResolvedValue({
      url: 'https://catalogo.example.com/acceso/abc',
      expiresAt: new Date(),
    });
    telegramService.sendMessage.mockResolvedValue(undefined);
    scheduleRepo.save.mockImplementation((valor) => Promise.resolve(valor));
  });

  /** Los handlers son privados; se llaman por nombre para no simular el reloj. */
  const enviarRecordatorios = () =>
    (scheduler as any).handleReminders(SEMANA) as Promise<void>;
  const aplicarMultas = () =>
    (scheduler as any).handleExhaustedReminders(SEMANA) as Promise<void>;

  it('cuenta el recordatorio y adjunta el acceso al portal', async () => {
    const schedule = pendiente();
    scheduleRepo.find.mockResolvedValue([schedule]);

    await enviarRecordatorios();

    expect(schedule.recordatoriosEnviados).toBe(1);
    expect(schedule.estado).toBe('recordatorio_enviado');

    const [chatId, texto, empleadaId, opciones] =
      telegramService.sendMessage.mock.calls[0];
    expect(chatId).toBe('555');
    expect(empleadaId).toBe('emp-1');
    expect(texto).toContain('Recordatorio 1 de 3');
    expect(opciones.buttons).toBeDefined();
  });

  it('avisa cuantos avisos quedan antes de la multa', async () => {
    scheduleRepo.find.mockResolvedValue([
      pendiente({ recordatoriosEnviados: 1 }),
    ]);

    await enviarRecordatorios();

    const [, texto] = telegramService.sendMessage.mock.calls[0];
    expect(texto).toContain('Recordatorio 2 de 3');
    expect(texto).toContain('1 aviso');
  });

  it('no manda un segundo recordatorio el mismo dia', async () => {
    scheduleRepo.find.mockResolvedValue([
      pendiente({ recordatoriosEnviados: 1, recordatorioAt: new Date() }),
    ]);

    await enviarRecordatorios();

    expect(telegramService.sendMessage).not.toHaveBeenCalled();
  });

  it('deja de avisar al agotar el tope configurado', async () => {
    scheduleRepo.find.mockResolvedValue([
      pendiente({ recordatoriosEnviados: 3 }),
    ]);

    await enviarRecordatorios();

    expect(telegramService.sendMessage).not.toHaveBeenCalled();
  });

  it('aplica la multa al agotarse los avisos y la deja rastreada', async () => {
    const schedule = pendiente({
      recordatoriosEnviados: 3,
      estado: 'recordatorio_enviado',
    });
    scheduleRepo.find.mockResolvedValue([schedule]);
    dataSource.query
      .mockResolvedValueOnce([{ id: 'jefe-1', rol: 'jefe' }])
      .mockResolvedValueOnce([{ id: 'registro-1' }]);

    await aplicarMultas();

    expect(schedule.estado).toBe('falta_aplicada');
    expect(schedule.multaAplicadaAt).toBeInstanceOf(Date);
    expect(schedule.multaLiquidationRecordId).toBe('registro-1');

    const [insercion, parametros] = dataSource.query.mock.calls[1];
    expect(insercion).toContain('INSERT INTO liquidation_records');
    expect(parametros).toContain(300);

    const [, texto] = telegramService.sendMessage.mock.calls[0];
    expect(texto).toContain('multa');
  });

  it('no vuelve a multar un ciclo que ya la tiene', async () => {
    scheduleRepo.find.mockResolvedValue([
      pendiente({ recordatoriosEnviados: 3, multaAplicadaAt: new Date() }),
    ]);

    await aplicarMultas();

    expect(dataSource.query).not.toHaveBeenCalled();
    expect(conductReportRepo.save).not.toHaveBeenCalled();
  });

  it('no multa a quien todavia tiene avisos por gastar', async () => {
    scheduleRepo.find.mockResolvedValue([
      pendiente({ recordatoriosEnviados: 2 }),
    ]);

    await aplicarMultas();

    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('avisa igual aunque no se pueda emitir el pase al portal', async () => {
    // Quedarse sin recordatorio es peor que quedarse sin el atajo.
    panelAccessService.issueLink.mockRejectedValue(new Error('sin origen'));
    scheduleRepo.find.mockResolvedValue([pendiente()]);

    await enviarRecordatorios();

    expect(telegramService.sendMessage).toHaveBeenCalledTimes(1);
    const [, , , opciones] = telegramService.sendMessage.mock.calls[0];
    expect(opciones.buttons).toBeUndefined();
  });

  it('registra el incumplimiento aunque no haya quien firme la multa', async () => {
    const schedule = pendiente({ recordatoriosEnviados: 3 });
    scheduleRepo.find.mockResolvedValue([schedule]);
    dataSource.query.mockResolvedValueOnce([]);

    await aplicarMultas();

    expect(schedule.multaLiquidationRecordId).toBeNull();
    expect(conductReportRepo.save).toHaveBeenCalledTimes(1);
    expect(schedule.estado).toBe('falta_aplicada');
  });
});
