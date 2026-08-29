import { NotFoundException } from '@nestjs/common';
import { ClientDossierService } from './client-dossier.service';

/**
 * La ficha del cliente: ocho agregaciones distintas en una sola respuesta.
 *
 * Las consultas se prueban por su forma, no contra Postgres: lo que puede
 * romperse aqui es que un bloque devuelva algo que la pantalla no espera --un
 * hueco en la serie mensual, un promedio nulo-- y eso si se puede fijar.
 */
describe('ClientDossierService', () => {
  let clientes: { findOne: jest.Mock };
  let dataSource: { query: jest.Mock };
  let discipline: { getActiveSanction: jest.Mock };
  let service: ClientDossierService;

  const CLIENTE = {
    id: 'cli-1',
    nombreTelegram: 'Carlos',
    telegramChatId: '123456',
    primerContactoAt: new Date('2026-01-01T00:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };

  /** Devuelve por orden lo que pide cada bloque de la ficha. */
  const respuestas = (extra: Record<string, unknown[]> = {}) => {
    const porDefecto: Record<string, unknown[]> = {
      resumen: [
        {
          serviciosTotales: 5,
          finalizados: 4,
          cancelados: 1,
          enCurso: 0,
          gastoTotal: 9600,
          ticketPromedio: 2400,
          horasTotales: 8,
          primerServicioAt: new Date('2026-02-01T00:00:00Z'),
          ultimoServicioAt: new Date('2026-08-01T00:00:00Z'),
        },
      ],
      calificaciones: [{ queDio: 4.5, queRecibio: 3 }],
      porMes: [],
      porMetodoPago: [{ metodo: 'efectivo', servicios: 3, gasto: 7200 }],
      porEmpleada: [
        { empleadaId: 'emp-1', nombre: 'Ana', servicios: 3, gasto: 7200 },
      ],
      lealtad: [{ puntos: 120, nivel: 'Oro' }],
      servicios: [],
      reportes: [],
      sanciones: [],
      alertas: [],
      ...extra,
    };
    const orden = [
      'resumen',
      'calificaciones',
      'porMes',
      'porMetodoPago',
      'porEmpleada',
      'lealtad',
      'servicios',
      'reportes',
      'sanciones',
      'alertas',
    ];
    // Las consultas salen en paralelo pero cada una pide algo distinto: se
    // reconoce por la tabla que menciona, no por el orden de llegada.
    return (sql: string) => {
      if (sql.includes('FROM interaction_ratings'))
        return porDefecto.calificaciones;
      if (sql.includes("date_trunc('month'")) return porDefecto.porMes;
      if (sql.includes('metodo_pago AS metodo'))
        return porDefecto.porMetodoPago;
      if (sql.includes('JOIN empleadas e')) return porDefecto.porEmpleada;
      if (sql.includes('client_memberships')) return porDefecto.lealtad;
      if (sql.includes('LEFT JOIN empleadas e')) return porDefecto.servicios;
      if (sql.includes('conduct_reports')) return porDefecto.reportes;
      if (sql.includes('disciplinary_sanctions')) return porDefecto.sanciones;
      if (sql.includes('alertas_clientes')) return porDefecto.alertas;
      if (sql.includes('FROM servicios')) return porDefecto.resumen;
      void orden;
      return [];
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    clientes = { findOne: jest.fn().mockResolvedValue(CLIENTE) };
    dataSource = {
      query: jest.fn((sql: string) => Promise.resolve(respuestas()(sql))),
    };
    discipline = { getActiveSanction: jest.fn().mockResolvedValue(null) };
    service = new ClientDossierService(
      clientes as any,
      dataSource as any,
      discipline as any,
    );
  });

  it('falla claro cuando el cliente no existe', async () => {
    clientes.findOne.mockResolvedValue(null);
    await expect(service.build('cli-x')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('resume el gasto, los servicios y las calificaciones', async () => {
    const ficha = await service.build('cli-1');

    expect(ficha.resumen.serviciosTotales).toBe(5);
    expect(ficha.resumen.gastoTotal).toBe(9600);
    expect(ficha.resumen.calificacionPromedioQueDio).toBe(4.5);
    expect(ficha.resumen.calificacionPromedioQueRecibio).toBe(3);
    expect(ficha.cliente.nombreTelegram).toBe('Carlos');
  });

  /** Una linea que salta de enero a junio miente sobre lo que paso en medio. */
  it('rellena los meses sin actividad para que la gráfica no mienta', async () => {
    const ficha = await service.build('cli-1');

    expect(ficha.porMes).toHaveLength(12);
    expect(ficha.porMes.every((punto) => punto.servicios === 0)).toBe(true);
    // Y en orden cronologico, que es como se dibuja.
    const meses = ficha.porMes.map((punto) => punto.mes);
    expect([...meses].sort()).toEqual(meses);
  });

  it('coloca en su mes los servicios que sí hubo', async () => {
    const ahora = new Date();
    const mesActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
    dataSource.query.mockImplementation((sql: string) =>
      Promise.resolve(
        respuestas({
          porMes: [{ mes: mesActual, servicios: 2, gasto: 4800 }],
        })(sql),
      ),
    );

    const ficha = await service.build('cli-1');
    const punto = ficha.porMes.find((item) => item.mes === mesActual);

    expect(punto).toEqual({ mes: mesActual, servicios: 2, gasto: 4800 });
  });

  it('marca el bloqueo activo con su motivo', async () => {
    discipline.getActiveSanction.mockResolvedValue({
      type: 'permanent_ban',
      reason: 'Trato inaceptable',
      startsAt: new Date('2026-08-01T00:00:00Z'),
      endsAt: null,
    });

    const ficha = await service.build('cli-1');

    expect(ficha.bloqueo).toEqual({
      bloqueado: true,
      tipo: 'permanent_ban',
      motivo: 'Trato inaceptable',
      desde: new Date('2026-08-01T00:00:00Z'),
      hasta: null,
    });
  });

  it('devuelve la lealtad como nula si el cliente no tiene membresía', async () => {
    dataSource.query.mockImplementation((sql: string) =>
      Promise.resolve(respuestas({ lealtad: [] })(sql)),
    );

    const ficha = await service.build('cli-1');
    expect(ficha.lealtad).toBeNull();
  });
});
