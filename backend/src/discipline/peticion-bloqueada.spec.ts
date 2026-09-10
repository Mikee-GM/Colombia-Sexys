import { DisciplineService } from './discipline.service';

/**
 * Una peticion que el bot corta.
 *
 * El aviso salia solo por el chat del grupo del jefe, donde se pierde entre
 * todo lo demas y no deja nada detras: nadie podia mirar despues cuantas veces
 * habia pasado con el mismo cliente, ni actuar sobre el desde el panel.
 */
describe('DisciplineService: peticion bloqueada por el bot', () => {
  let reports: { create: jest.Mock; save: jest.Mock };
  let realtime: { emitToBoss: jest.Mock; emitToJefes: jest.Mock };
  let notifications: { notificar: jest.Mock };
  let service: DisciplineService;

  const entrada = {
    clienteId: 'cli-1',
    empleadaId: 'emp-1',
    jefeUsuarioId: 'jefe-1',
    categoria: 'menores',
    mensaje: 'quiero una niña menor de edad',
    empleadaNombre: 'Valeria',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    reports = {
      create: jest.fn((data: Record<string, unknown>) => ({
        id: 'rep-1',
        ...data,
      })),
      save: jest.fn((v: unknown) => Promise.resolve(v)),
    };
    realtime = { emitToBoss: jest.fn(), emitToJefes: jest.fn() };
    notifications = { notificar: jest.fn().mockResolvedValue(1) };

    service = Object.create(DisciplineService.prototype) as DisciplineService;
    Object.assign(service, {
      logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
      ratings: {},
      reports,
      sanctions: {},
      dataSource: { query: jest.fn(), getRepository: jest.fn() },
      notifications,
      realtime,
      configService: { get: jest.fn() },
    });
  });

  it('guarda un reporte urgente contra el cliente', async () => {
    await service.registrarPeticionBloqueada(entrada);

    expect(reports.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectType: 'client',
        subjectId: 'cli-1',
        reporterType: 'employee',
        reporterId: 'emp-1',
        category: 'seguridad',
        // La categoria que dispara esto no admite un "ya lo vere manana".
        priority: 'urgente',
        status: 'nuevo',
      }),
    );
    const guardado = reports.create.mock.calls[0][0] as { description: string };
    expect(guardado.description).toContain('menores');
    expect(guardado.description).toContain('quiero una niña menor de edad');
  });

  it('llega al panel del jefe de esa modelo y al de administracion', async () => {
    await service.registrarPeticionBloqueada(entrada);

    const evento = expect.objectContaining({
      type: 'discipline.blocked_request',
      data: expect.objectContaining({ clienteId: 'cli-1' }),
    });
    expect(realtime.emitToBoss).toHaveBeenCalledWith('jefe-1', evento);
    expect(realtime.emitToJefes).toHaveBeenCalledWith(evento);
  });

  /*
   * El aviso push se lee en la pantalla de bloqueo, a la vista de cualquiera
   * que pase al lado: no puede repetir lo que escribio el cliente.
   */
  it('no mete lo que escribio el cliente en el aviso push', async () => {
    await service.registrarPeticionBloqueada(entrada);

    expect(notifications.notificar).toHaveBeenCalledTimes(1);
    const [usuarioId, aviso] = notifications.notificar.mock.calls[0] as [
      string,
      { titulo: string; cuerpo: string },
    ];
    expect(usuarioId).toBe('jefe-1');
    expect(`${aviso.titulo} ${aviso.cuerpo}`).not.toContain('menor');
    expect(`${aviso.titulo} ${aviso.cuerpo}`).not.toContain('Valeria');
  });

  it('sin jefe conocido deja el reporte igual y no manda push', async () => {
    await service.registrarPeticionBloqueada({
      ...entrada,
      jefeUsuarioId: null,
    });

    expect(reports.save).toHaveBeenCalled();
    expect(notifications.notificar).not.toHaveBeenCalled();
  });
});
