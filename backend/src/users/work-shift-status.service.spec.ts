import { WorkShiftStatusService } from './work-shift-status.service';

/**
 * Cerrar la jornada tiene que avisar a alguien: a su jefe si es una modelo, al
 * panel de admin si es un chofer o un jefe. Y ningun fallo de mensajeria puede
 * impedir que la persona cierre su dia.
 */
describe('WorkShiftStatusService', () => {
  const usuarios = {
    findOneOrFail: jest.fn(),
    update: jest.fn(),
    find: jest.fn(),
  };
  const empleadas = { findOne: jest.fn() };
  const telegram = { sendMessage: jest.fn() };
  const realtime = { emitToBoss: jest.fn(), emitToJefes: jest.fn() };

  /*
   * Se construye por nombre y no con `new`.
   *
   * Con la lista posicional, cada dependencia nueva del servicio desplazaba todos
   * los dobles y estas pruebas fallaban por un motivo ajeno a lo que probaban.
   * Los campos inicializados de la clase entran como dobles porque
   * `Object.create` no los ejecuta.
   */
  const service = Object.create(
    WorkShiftStatusService.prototype,
  ) as WorkShiftStatusService;
  Object.assign(service, {
    logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
    usuarios,
    empleadas,
    telegram,
    realtime,
  });

  const modelo = {
    id: 'u-modelo',
    rol: 'empleada',
    enJornada: true,
    jornadaActualizadaAt: null,
  } as any;

  const chofer = {
    id: 'u-chofer',
    rol: 'chofer',
    nombre: 'Luis',
    apellido: 'Perez',
    enJornada: true,
    jornadaActualizadaAt: null,
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    empleadas.findOne.mockResolvedValue({
      id: 'emp-1',
      nombreArtistico: 'Ana',
      jefe: { id: 'jefe-1', telegramChatId: '111' },
      jefeSecundario: null,
    });
  });

  it('no hace nada si el estado ya era ese', async () => {
    await service.setStatus(modelo, true);

    expect(usuarios.update).not.toHaveBeenCalled();
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('guarda el cambio con su marca de tiempo', async () => {
    await service.setStatus(modelo, false);

    const [id, cambios] = usuarios.update.mock.calls[0];
    expect(id).toBe('u-modelo');
    expect(cambios.enJornada).toBe(false);
    expect(cambios.jornadaActualizadaAt).toBeInstanceOf(Date);
  });

  it('le avisa por Telegram al jefe cuando la modelo cierra su jornada', async () => {
    await service.setStatus(modelo, false);

    expect(telegram.sendMessage).toHaveBeenCalledWith(
      '111',
      expect.stringContaining('cerro su jornada'),
    );
  });

  it('marca tambien en el panel de admin el cambio de una modelo', async () => {
    await service.setStatus(modelo, false);

    expect(realtime.emitToJefes).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'staff_work_shift_changed',
        data: expect.objectContaining({ rol: 'empleada', enJornada: false }),
      }),
    );
  });

  it('avisa tambien al jefe secundario, que puede estar cubriendo el turno', async () => {
    empleadas.findOne.mockResolvedValue({
      id: 'emp-1',
      nombreArtistico: 'Ana',
      jefe: { id: 'jefe-1', telegramChatId: '111' },
      jefeSecundario: { id: 'jefe-2', telegramChatId: '222' },
    });

    await service.setStatus(modelo, false);

    expect(telegram.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('no avisa dos veces si el principal y el secundario son el mismo', async () => {
    const jefe = { id: 'jefe-1', telegramChatId: '111' };
    empleadas.findOne.mockResolvedValue({
      id: 'emp-1',
      nombreArtistico: 'Ana',
      jefe,
      jefeSecundario: jefe,
    });

    await service.setStatus(modelo, false);

    expect(telegram.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('marca en el panel de admin el cambio de un chofer, sin Telegram', async () => {
    await service.setStatus(chofer, false);

    expect(telegram.sendMessage).not.toHaveBeenCalled();
    expect(realtime.emitToJefes).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'staff_work_shift_changed',
        data: expect.objectContaining({
          rol: 'chofer',
          nombre: 'Luis Perez',
          enJornada: false,
        }),
      }),
    );
  });

  it('deja cerrar la jornada aunque Telegram falle', async () => {
    telegram.sendMessage.mockRejectedValue(new Error('sin red'));

    const result = await service.setStatus(modelo, false);

    expect(result.enJornada).toBe(false);
    expect(usuarios.update).toHaveBeenCalled();
  });

  it('lista a quien esta fuera de jornada con su nombre resuelto', async () => {
    usuarios.find.mockResolvedValue([
      {
        id: 'u-1',
        rol: 'chofer',
        nombre: 'Luis',
        apellido: 'Perez',
        email: 'luis@x.mx',
        jornadaActualizadaAt: new Date(),
      },
      {
        id: 'u-2',
        rol: 'jefe',
        nombre: null,
        apellido: null,
        email: 'jefe@x.mx',
        jornadaActualizadaAt: null,
      },
    ]);

    const result = await service.listOffDuty();

    expect(result[0].nombre).toBe('Luis Perez');
    // Sin nombre cargado, el correo es mejor identificador que una cadena vacia.
    expect(result[1].nombre).toBe('jefe@x.mx');
  });
});
