import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DisciplineService } from './discipline.service';

/**
 * Que la persona señalada se entere y pueda contar su version.
 *
 * Un reporte se resolvia con un solo relato delante: el de quien lo levanto.
 * Quien lo recibia no sabia que existia hasta que le caia una sancion, y para
 * entonces la decision estaba tomada. Vale igual para modelos y para choferes:
 * el reporte no distingue y este camino tampoco.
 */
describe('DisciplineService: la version de quien fue reportado', () => {
  function armar(overrides: Record<string, unknown> = {}) {
    const reports = {
      findOneBy: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn((fila: unknown) => Promise.resolve(fila)),
    };
    const realtime = { emitToJefes: jest.fn(), emitToBoss: jest.fn() };
    const notifications = { notificar: jest.fn().mockResolvedValue(1) };
    const telegram = { sendMessage: jest.fn().mockResolvedValue(undefined) };
    const query = jest.fn().mockResolvedValue([{ id: 'emp-1' }]);

    /*
     * Se construye por nombre y no por posicion: asi una dependencia nueva del
     * servicio no desplaza los dobles. El registro entra como doble porque
     * `Object.create` no ejecuta los campos inicializados de la clase.
     */
    const service = Object.create(
      DisciplineService.prototype,
    ) as DisciplineService;
    Object.assign(service, {
      logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
      reports,
      realtime,
      notifications,
      telegram,
      dataSource: { query },
      ...overrides,
    });

    return { service, reports, realtime, notifications, telegram, query };
  }

  const reporteAbierto = (extra: Record<string, unknown> = {}) => ({
    id: 'rep-1',
    subjectType: 'employee',
    subjectId: 'emp-1',
    status: 'nuevo',
    serviceId: 'srv-1',
    history: [],
    ...extra,
  });

  describe('el aviso al reportado', () => {
    /*
     * No se puede silenciar y sale por los dos canales: de ese aviso depende
     * que pueda defenderse, y el push solo llega si tiene la aplicacion
     * instalada.
     */
    it('avisa por push y por chat, sin poder apagarlo', async () => {
      const { service, notifications, telegram, query } = armar();
      query.mockResolvedValue([{ telegramChatId: '555' }]);
      (service as any).usuarioDelSujeto = jest
        .fn()
        .mockResolvedValue('user-emp');

      await (service as any).avisarAlReportado({
        id: 'rep-1',
        subjectType: 'employee',
        subjectId: 'emp-1',
        description: 'Llegó tarde',
      });

      const aviso = notifications.notificar.mock.calls[0][1];
      expect(aviso.tipo).toBeUndefined();
      expect(aviso.url).toContain('/empleada/portal');
      expect(telegram.sendMessage).toHaveBeenCalledWith(
        '555',
        expect.stringContaining('tu versión'),
      );
    });

    /** Un chofer reportado se entera igual, y por su portal. */
    it('vale igual para un chofer', async () => {
      const { service, notifications, query } = armar();
      query.mockResolvedValue([{ telegramChatId: '777' }]);
      (service as any).usuarioDelSujeto = jest
        .fn()
        .mockResolvedValue('user-chofer');

      await (service as any).avisarAlReportado({
        id: 'rep-2',
        subjectType: 'driver',
        subjectId: 'chofer-1',
        description: 'No recogió a la modelo',
      });

      expect(notifications.notificar.mock.calls[0][1].url).toContain(
        '/chofer/portal',
      );
    });

    /*
     * A un cliente reportado no se le avisa: no tiene portal donde defenderse
     * y avisarle solo serviria para que se escondiera.
     */
    it('no le avisa a un cliente reportado', async () => {
      const { service, notifications, telegram } = armar();

      await (service as any).avisarAlReportado({
        id: 'rep-3',
        subjectType: 'client',
        subjectId: 'cli-1',
        description: 'Se puso agresivo',
      });

      expect(notifications.notificar).not.toHaveBeenCalled();
      expect(telegram.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('responderReporte', () => {
    it('guarda la version de quien fue señalada', async () => {
      const { service, reports, realtime } = armar();
      reports.findOneBy.mockResolvedValue(reporteAbierto());

      const guardado: any = await service.responderReporte(
        { id: 'user-1', rol: 'empleada' },
        'rep-1',
        'El cliente pidió algo que no estaba acordado y me negué',
      );

      expect(guardado.subjectStatement).toBe(
        'El cliente pidió algo que no estaba acordado y me negué',
      );
      expect(guardado.subjectStatementAt).toBeInstanceOf(Date);
      expect(guardado.history.at(-1)).toEqual(
        expect.objectContaining({ action: 'subject_statement' }),
      );
      // Quien decide tiene que enterarse de que ya hay dos versiones.
      expect(realtime.emitToJefes).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'discipline.report.answered' }),
      );
    });

    it('no deja responder un reporte que es sobre otra persona', async () => {
      const { service, reports } = armar();
      reports.findOneBy.mockResolvedValue(
        reporteAbierto({ subjectId: 'otra-emp' }),
      );

      await expect(
        service.responderReporte(
          { id: 'user-1', rol: 'empleada' },
          'rep-1',
          'Esto no es mío pero quiero opinar igual',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(reports.save).not.toHaveBeenCalled();
    });

    /*
     * Una vez cerrado, la decision ya se tomo: anadir texto por detras haria
     * parecer que se leyo algo que nadie leyo.
     */
    it('no admite versiones sobre un reporte ya resuelto', async () => {
      const { service, reports } = armar();
      reports.findOneBy.mockResolvedValue(
        reporteAbierto({ status: 'cerrado' }),
      );

      await expect(
        service.responderReporte(
          { id: 'user-1', rol: 'empleada' },
          'rep-1',
          'Quiero contar lo que pasó de verdad',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(reports.save).not.toHaveBeenCalled();
    });

    it('un cliente o un jefe no tienen reportes propios que responder', async () => {
      const { service } = armar();

      await expect(
        service.responderReporte(
          { id: 'user-jefe', rol: 'jefe' },
          'rep-1',
          'Mi versión de los hechos como jefe',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
