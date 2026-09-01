import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ManualServicesService } from './manual-services.service';

/**
 * El registro de un servicio que ocurrio fuera del sistema.
 *
 * No es una reserva: es una afirmacion sobre algo que ya paso, que alguien
 * tiene que dar por buena antes de que entre en el corte de la empleada.
 */
describe('ManualServicesService', () => {
  let solicitudes: any;
  let empleadas: any;
  let usuarios: any;
  let clientes: any;
  let servicios: any;
  let updateBuilder: any;
  let realtime: any;
  let liquidationSync: any;
  let service: ManualServicesService;

  const HACE_DOS_DIAS = new Date(
    Date.now() - 2 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const datos = (extra: Record<string, unknown> = {}) => ({
    fechaServicio: HACE_DOS_DIAS,
    duracionHoras: 2,
    metodoPago: 'efectivo' as const,
    montoCobrado: 2400,
    motivo: 'El cliente llego por recomendacion y no paso por el bot',
    ...extra,
  });

  const solicitudPendiente = () => ({
    id: 'sol-1',
    estado: 'pendiente',
    empleadaId: 'emp-1',
    jefeId: 'jefe-1',
    clienteId: null,
    clienteNombreLibre: 'Carlos',
    fechaServicio: new Date(HACE_DOS_DIAS),
    duracionHoras: 2,
    metodoPago: 'efectivo',
    montoCobrado: 2400,
    ubicacion: 'Motel Luna',
    motivo: 'Fuera del sistema',
    empleada: {
      id: 'emp-1',
      jefeId: 'jefe-1',
      ubicacionLat: 19.4,
      ubicacionLng: -99.1,
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    updateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    solicitudes = {
      create: jest.fn((data: unknown) => data),
      save: jest.fn((data: any) => Promise.resolve({ ...data, id: 'sol-1' })),
      findOne: jest.fn().mockResolvedValue(solicitudPendiente()),
      update: jest.fn(),
      createQueryBuilder: jest.fn(() => updateBuilder),
    };
    empleadas = {
      findOne: jest.fn().mockResolvedValue({
        id: 'emp-1',
        usuarioId: 'user-emp',
        jefeId: 'jefe-1',
        jefeSecundarioId: null,
        ubicacionLat: 19.4,
        ubicacionLng: -99.1,
      }),
      findOneOrFail: jest.fn(),
    };
    usuarios = {
      findOne: jest.fn().mockResolvedValue({
        id: 'jefe-1',
        rol: 'jefe',
        activo: true,
      }),
    };
    clientes = { findOne: jest.fn() };
    servicios = {
      create: jest.fn((data: unknown) => data),
      save: jest.fn((data: any) => Promise.resolve({ ...data, id: 'srv-1' })),
      findOne: jest.fn().mockResolvedValue({ id: 'srv-1', totalFinal: 2400 }),
    };
    realtime = {
      emitToBoss: jest.fn(),
      emitToJefes: jest.fn(),
      emitToEmployee: jest.fn(),
    };
    liquidationSync = {
      syncOfficeRecord: jest.fn().mockResolvedValue(undefined),
    };

    service = new ManualServicesService(
      solicitudes,
      empleadas,
      usuarios,
      clientes,
      servicios,
      realtime,
      // Los avisos push no intervienen en aprobar un registro: se comprueba que
      // no estorben, no lo que mandan.
      { notificar: jest.fn().mockResolvedValue(0) } as never,
      liquidationSync,
    );
  });

  describe('crear', () => {
    it('guarda la solicitud pendiente para el jefe de la empleada', async () => {
      await service.crear('user-emp', datos());

      expect(solicitudes.create).toHaveBeenCalledWith(
        expect.objectContaining({
          empleadaId: 'emp-1',
          jefeId: 'jefe-1',
          estado: 'pendiente',
          montoCobrado: 2400,
        }),
      );
      expect(realtime.emitToBoss).toHaveBeenCalled();
    });

    it('no admite un servicio que todavia no ha ocurrido', async () => {
      const manana = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await expect(
        service.crear('user-emp', datos({ fechaServicio: manana }) as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    /** Sin tope, un registro de hace meses reabre cortes ya cerrados. */
    it('no admite un servicio demasiado antiguo', async () => {
      const hace100Dias = new Date(
        Date.now() - 100 * 24 * 60 * 60 * 1000,
      ).toISOString();
      await expect(
        service.crear('user-emp', datos({ fechaServicio: hace100Dias }) as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('exige un monto cobrado positivo', async () => {
      await expect(
        service.crear('user-emp', datos({ montoCobrado: 0 }) as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza a quien no tiene perfil de empleada', async () => {
      empleadas.findOne.mockResolvedValue(null);
      await expect(
        service.crear('user-cualquiera', datos() as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('aprobar', () => {
    beforeEach(() => {
      usuarios.findOne.mockResolvedValue({
        id: 'jefe-1',
        rol: 'jefe',
        activo: true,
      });
    });

    it('crea el servicio ya finalizado y marcado como registro manual', async () => {
      await service.aprobar('sol-1', 'jefe-1');

      expect(servicios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          empleadaId: 'emp-1',
          estado: 'finalizado',
          registroManual: true,
          duracionPactadaHoras: 2,
          // La tarifa se deriva del monto declarado: 2400 en 2 horas.
          precioBaseHoraPactado: 1200,
          customerTransportCharge: 0,
        }),
      );
      expect(liquidationSync.syncOfficeRecord).toHaveBeenCalledWith('srv-1');
    });

    it('conserva el nombre del cliente cuando no esta registrado', async () => {
      await service.aprobar('sol-1', 'jefe-1');

      expect(servicios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          clienteId: null,
          clienteNombreLibre: 'Carlos',
        }),
      );
    });

    /** Dos toques en "Aprobar" no pueden crear dos servicios. */
    it('no crea un segundo servicio si ya se resolvio', async () => {
      updateBuilder.execute.mockResolvedValue({ affected: 0 });

      await expect(service.aprobar('sol-1', 'jefe-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(servicios.save).not.toHaveBeenCalled();
    });

    it('no deja resolver a un jefe ajeno a la empleada', async () => {
      usuarios.findOne.mockResolvedValue({
        id: 'jefe-otro',
        rol: 'jefe',
        activo: true,
      });

      await expect(
        service.aprobar('sol-1', 'jefe-otro'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('deja resolver a un admin aunque no sea el jefe asignado', async () => {
      usuarios.findOne.mockResolvedValue({
        id: 'admin-1',
        rol: 'admin',
        activo: true,
      });

      await expect(service.aprobar('sol-1', 'admin-1')).resolves.toBeDefined();
    });
  });

  describe('rechazar', () => {
    /** La empleada solo recibe la nota: sin motivo no se entera de nada. */
    it('exige explicar el rechazo', async () => {
      await expect(
        service.rechazar('sol-1', 'jefe-1', '   '),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('deja constancia de quien lo rechazo y por que', async () => {
      await service.rechazar('sol-1', 'jefe-1', 'No me consta ese servicio');

      expect(updateBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({
          estado: 'rechazada',
          resueltoPorUserId: 'jefe-1',
          notaResolucion: 'No me consta ese servicio',
        }),
      );
      expect(servicios.save).not.toHaveBeenCalled();
    });
  });
});
