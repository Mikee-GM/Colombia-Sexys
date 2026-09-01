import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DisciplineService } from './discipline.service';

/**
 * Bloquear a un cliente.
 *
 * Es la unica sancion que un jefe puede imponer solo: castigar a una empleada o
 * a un chofer toca su sustento y sigue siendo cosa de administracion, pero el
 * cliente problematico lo tiene delante el jefe, y esperar a que un admin este
 * disponible significa que ese cliente sigue escribiendo a las modelos entre
 * tanto. Lo que se fija aqui es esa asimetria, y que sin fecha final el bloqueo
 * es definitivo.
 */
describe('DisciplineService: bloqueo de clientes', () => {
  let sanciones: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
  };
  let realtime: { emitToJefes: jest.Mock };
  let service: DisciplineService;

  const JEFE = { id: 'jefe-1', rol: 'jefe' as const };
  const EMPLEADA = { id: 'emp-1', rol: 'empleada' as const };

  beforeEach(() => {
    jest.clearAllMocks();
    sanciones = {
      create: jest.fn((data: Record<string, unknown>) => ({
        id: 'san-1',
        ...data,
      })),
      save: jest.fn((v: unknown) => Promise.resolve(v)),
      find: jest.fn().mockResolvedValue([]),
    };
    realtime = { emitToJefes: jest.fn() };
    /*
     * Se construye por nombre y no por posicion.
     *
     * Con la lista posicional, cada dependencia nueva del servicio desplazaba
     * todos los dobles y las pruebas fallaban por un motivo ajeno a lo que
     * probaban. Paso cinco veces en una sola tanda de trabajo. El registro entra
     * como doble porque `Object.create` no ejecuta los campos inicializados de la
     * clase.
     */
    service = Object.create(DisciplineService.prototype) as DisciplineService;
    Object.assign(service, {
      logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
      ratings: {},
      reports: {},
      sanctions: sanciones,
      // persistSanction comprueba que la persona existe antes de nada.
      dataSource: {
        query: jest.fn().mockResolvedValue([{ id: 'cli-1' }]),
        getRepository: jest.fn(),
      },
      // Los avisos push no cambian nada de un bloqueo: se comprueba que no
      // estorben, no lo que mandan.
      notifications: { notificar: jest.fn().mockResolvedValue(0) },
      realtime,
      configService: { get: jest.fn() },
    });
  });

  it('sin fecha final el bloqueo es definitivo', async () => {
    await service.blockClient('cli-1', JEFE, { reason: 'Trato inaceptable' });

    expect(sanciones.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectType: 'client',
        subjectId: 'cli-1',
        type: 'permanent_ban',
        reason: 'Trato inaceptable',
        createdByUserId: 'jefe-1',
      }),
    );
  });

  it('con fecha final es una suspensión temporal', async () => {
    const hasta = new Date(Date.now() + 86_400_000).toISOString();

    await service.blockClient('cli-1', JEFE, {
      reason: 'Se pasó de la raya',
      endsAt: hasta,
    });

    expect(sanciones.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'suspension' }),
    );
  });

  /** Es lo que separa esta sancion de todas las demas. */
  it('una empleada no puede bloquear a un cliente por su cuenta', async () => {
    await expect(
      service.blockClient('cli-1', EMPLEADA, { reason: 'me cayó mal' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(sanciones.create).not.toHaveBeenCalled();
  });

  it('levanta todos los bloqueos activos de una vez', async () => {
    const activas = [
      { id: 'san-1', status: 'active' },
      { id: 'san-2', status: 'active' },
    ];
    sanciones.find.mockResolvedValue(activas);

    const resultado = await service.unblockClient(
      'cli-1',
      JEFE,
      'Fue un malentendido',
    );

    expect(resultado).toEqual({ levantadas: 2 });
    expect(activas.every((s) => s.status === 'revoked')).toBe(true);
    expect(realtime.emitToJefes).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'discipline.client.unblocked' }),
    );
  });

  /** Queda escrito quien lo levanto y por que: el rastro es el control. */
  it('exige un motivo para levantar el bloqueo', async () => {
    await expect(
      service.unblockClient('cli-1', JEFE, '   '),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(sanciones.save).not.toHaveBeenCalled();
  });

  it('no guarda nada si el cliente no tenía bloqueos', async () => {
    const resultado = await service.unblockClient('cli-1', JEFE, 'Revisión');

    expect(resultado).toEqual({ levantadas: 0 });
    expect(sanciones.save).not.toHaveBeenCalled();
  });

  it('una empleada tampoco puede levantar un bloqueo', async () => {
    await expect(
      service.unblockClient('cli-1', EMPLEADA, 'porque sí'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
