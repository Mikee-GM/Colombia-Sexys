import { EmployeeMoneyService } from './employee-money.service';
import type { LiquidationPeriodQueryDto } from './dto/liquidation-query.dto';
import type { LiquidationRecord } from './entities/liquidation-record.entity';
import type { Usuarios } from '../users/entities/user.entity';

/**
 * El servicio inyecta cinco repositorios y otro servicio. Como lo que hay que
 * comprobar son las cuentas y no el acceso a datos, se instancia sobre el
 * prototipo y se le enchufan dobles, igual que en el resto de pruebas de esta
 * carpeta.
 */
type Privados = {
  variacion(actual: number, anterior: number): number | null;
  periodoAnterior(query: LiquidationPeriodQueryDto): LiquidationPeriodQueryDto;
  rendimiento(registros: LiquidationRecord[]): {
    servicesCount: number;
    cancelledCount: number;
    finesCount: number;
    cancelRate: number;
    averageTicket: number;
    daysWorked: number;
    servicesPerActiveDay: number;
  };
};

const admin = { id: 'admin-1', rol: 'admin' } as Usuarios;

const semana = {
  startDate: new Date('2026-08-17T00:00:00.000Z'),
  endDate: new Date('2026-08-23T23:59:59.999Z'),
} as LiquidationPeriodQueryDto;

function registro(parcial: Partial<LiquidationRecord>): LiquidationRecord {
  return {
    id: Math.random().toString(36).slice(2),
    employeeId: 'emp-1',
    occurredAt: new Date('2026-08-18T15:00:00.000Z'),
    serviceTotal: 1000,
    paymentMethod: 'efectivo',
    cashAmount: 0,
    cardAmounts: [],
    companyPercentage: 40,
    extraAmount: 0,
    promotion: false,
    membershipAmount: 0,
    companyTransportExpense: 0,
    customerTransportCharge: 0,
    transportExcess: 0,
    employeeUberReimbursement: 0,
    employeeCashDue: 0,
    cancelled: false,
    isFine: false,
    fineAmount: 0,
    sourceRole: 'admin',
    ...parcial,
  } as LiquidationRecord;
}

function nuevoServicio() {
  const servicio = Object.create(
    EmployeeMoneyService.prototype,
  ) as EmployeeMoneyService;
  return { servicio, privados: servicio as unknown as Privados };
}

describe('Variacion entre periodos', () => {
  /**
   * Pasar de 0 a 5000 no es un aumento del infinito por ciento: es la primera
   * semana con actividad. La pantalla escribe "sin comparativa" en vez de un
   * numero que enganaria.
   */
  it('no inventa un porcentaje cuando no hay base', () => {
    const { privados } = nuevoServicio();
    expect(privados.variacion(5000, 0)).toBeNull();
  });

  it('calcula la subida con un decimal', () => {
    const { privados } = nuevoServicio();
    expect(privados.variacion(1100, 1000)).toBe(10);
    expect(privados.variacion(1234, 1000)).toBe(23.4);
  });

  it('calcula la bajada en negativo', () => {
    const { privados } = nuevoServicio();
    expect(privados.variacion(800, 1000)).toBe(-20);
  });
});

describe('Periodo anterior', () => {
  /**
   * Se desplaza el rango que pidio la pantalla en vez de calcular semanas
   * naturales, para que la comparativa siempre enfrente periodos del mismo
   * largo aunque el rango pedido no sea una semana.
   */
  it('desplaza el rango hacia atras conservando su duracion', () => {
    const { privados } = nuevoServicio();
    const anterior = privados.periodoAnterior(semana);
    const duracion = (rango: { startDate: Date; endDate: Date }) =>
      rango.endDate.getTime() - rango.startDate.getTime();

    expect(duracion(anterior)).toBe(duracion(semana));
    expect(anterior.endDate.getTime()).toBe(semana.startDate.getTime());
    expect(anterior.startDate.toISOString().slice(0, 10)).toBe('2026-08-10');
  });
});

describe('Rendimiento del periodo', () => {
  it('separa servicios, cancelados y multas', () => {
    const { privados } = nuevoServicio();
    const resultado = privados.rendimiento([
      registro({}),
      registro({}),
      registro({ cancelled: true }),
      registro({ isFine: true, fineAmount: 200 }),
    ]);

    expect(resultado.servicesCount).toBe(2);
    expect(resultado.cancelledCount).toBe(1);
    expect(resultado.finesCount).toBe(1);
  });

  /**
   * La tasa se mide sobre los servicios agendados —hechos mas cancelados— y no
   * sobre todos los registros: meter las multas en el denominador haria bajar
   * la tasa de cancelacion justo cuando a alguien la sancionan.
   */
  it('mide la tasa de cancelacion sin contar las multas', () => {
    const { privados } = nuevoServicio();
    const resultado = privados.rendimiento([
      registro({}),
      registro({}),
      registro({}),
      registro({ cancelled: true }),
      registro({ isFine: true, fineAmount: 500 }),
    ]);

    expect(resultado.cancelRate).toBe(25);
  });

  it('promedia el ticket solo sobre los servicios que se hicieron', () => {
    const { privados } = nuevoServicio();
    const resultado = privados.rendimiento([
      registro({ serviceTotal: 1000 }),
      registro({ serviceTotal: 2000 }),
      registro({ serviceTotal: 9999, cancelled: true }),
    ]);

    expect(resultado.averageTicket).toBe(1500);
  });

  /**
   * Distingue a quien hace cinco servicios en dos dias de quien los reparte en
   * cinco: es la diferencia entre una jornada intensa y una semana floja, y en
   * el total de servicios las dos se ven igual.
   */
  it('cuenta los dias con actividad y el ritmo por dia', () => {
    const { privados } = nuevoServicio();
    const resultado = privados.rendimiento([
      registro({ occurredAt: new Date('2026-08-18T10:00:00.000Z') }),
      registro({ occurredAt: new Date('2026-08-18T22:00:00.000Z') }),
      registro({ occurredAt: new Date('2026-08-19T10:00:00.000Z') }),
    ]);

    expect(resultado.daysWorked).toBe(2);
    expect(resultado.servicesPerActiveDay).toBe(1.5);
  });

  it('no divide entre cero cuando no hubo actividad', () => {
    const { privados } = nuevoServicio();
    const resultado = privados.rendimiento([]);

    expect(resultado.averageTicket).toBe(0);
    expect(resultado.cancelRate).toBe(0);
    expect(resultado.servicesPerActiveDay).toBe(0);
  });
});

describe('Listado de dinero por empleada', () => {
  function montar(datos: {
    registros?: LiquidationRecord[];
    anteriores?: LiquidationRecord[];
    empleadas?: Record<string, unknown>[];
    deudas?: Record<string, unknown>[];
    obligaciones?: Record<string, unknown>[];
    confirmadas?: Record<string, unknown>[];
  }) {
    const { servicio } = nuevoServicio();
    const interno = servicio as unknown as Record<string, unknown>;

    let llamada = 0;
    interno.liquidations = {
      getRecords: jest.fn().mockImplementation(() => {
        llamada += 1;
        return Promise.resolve(
          llamada === 1 ? (datos.registros ?? []) : (datos.anteriores ?? []),
        );
      }),
    };
    interno.employees = { find: () => Promise.resolve(datos.empleadas ?? []) };
    interno.debts = { find: () => Promise.resolve(datos.deudas ?? []) };
    interno.obligations = {
      find: () => Promise.resolve(datos.obligaciones ?? []),
    };
    interno.settlements = {
      find: () => Promise.resolve(datos.confirmadas ?? []),
    };
    return servicio;
  }

  const empleada = {
    id: 'emp-1',
    nombreArtistico: 'Vale',
    nombreReal: 'Valentina',
    jefeId: null,
    jefeSecundarioId: null,
    usuario: { activo: true },
  };

  /**
   * El numero que responde "que hago hoy con esta persona". El efectivo sin
   * entregar ya viene descontado dentro de `netEmployeePay`, asi que volver a
   * restarlo aqui lo contaria dos veces y dejaria el saldo por debajo de lo que
   * de verdad se le debe.
   */
  it('no cuenta dos veces el efectivo al calcular el saldo', async () => {
    const servicio = montar({
      registros: [registro({ serviceTotal: 1000 })],
      empleadas: [empleada],
      obligaciones: [
        {
          employeeId: 'emp-1',
          amount: 200,
          paidAmount: 0,
          status: 'pending',
          calculationStatus: 'ready',
        },
      ],
    });

    const [fila] = await servicio.overview(semana, admin);

    // 60 % de 1000 son 600 brutos; 200 se compensan con el efectivo.
    expect(fila.employeeGrossPay).toBe(600);
    expect(fila.cashOutstanding).toBe(200);
    expect(fila.cashOffset).toBe(200);
    expect(fila.netEmployeePay).toBe(400);
    expect(fila.balance).toBe(400);
  });

  it('resta del saldo la deuda viva de la empleada', async () => {
    const servicio = montar({
      registros: [registro({ serviceTotal: 1000 })],
      empleadas: [empleada],
      deudas: [
        {
          employeeId: 'emp-1',
          amount: 250,
          status: 'pending',
          payments: [{ amount: 100, deletedAt: null }],
        },
      ],
    });

    const [fila] = await servicio.overview(semana, admin);

    expect(fila.debtOutstanding).toBe(150);
    expect(fila.balance).toBe(450);
  });

  /**
   * Una empleada que no trabajo esta semana pero arrastra una deuda es justo a
   * quien no se puede perder de vista. Con un listado construido solo desde los
   * registros del periodo desaparecia de la pantalla.
   */
  it('incluye a quien no trabajo pero sigue debiendo', async () => {
    const servicio = montar({
      registros: [],
      empleadas: [empleada],
      deudas: [
        {
          employeeId: 'emp-1',
          amount: 500,
          status: 'pending',
          payments: [],
        },
      ],
    });

    const filas = await servicio.overview(semana, admin);

    expect(filas).toHaveLength(1);
    expect(filas[0].servicesCount).toBe(0);
    expect(filas[0].debtOutstanding).toBe(500);
    expect(filas[0].balance).toBe(-500);
  });

  it('ignora los abonos anulados al medir la deuda', async () => {
    const servicio = montar({
      registros: [],
      empleadas: [empleada],
      deudas: [
        {
          employeeId: 'emp-1',
          amount: 500,
          status: 'pending',
          payments: [{ amount: 500, deletedAt: new Date() }],
        },
      ],
    });

    const [fila] = await servicio.overview(semana, admin);

    expect(fila.debtOutstanding).toBe(500);
  });

  /**
   * Confirmada la semana, los numeros de la fila salen de la liquidacion
   * guardada y no de recalcular el corte: si un registro cambia despues, lo que
   * se le pago a la empleada sigue siendo lo que se le pago.
   */
  it('respeta las cifras guardadas cuando la semana ya esta confirmada', async () => {
    const servicio = montar({
      registros: [registro({ serviceTotal: 1000 })],
      empleadas: [empleada],
      confirmadas: [
        {
          employeeId: 'emp-1',
          grossEmployeePay: 555,
          cashOffset: 55,
          netEmployeePay: 500,
          confirmedAt: new Date('2026-08-24T10:00:00.000Z'),
        },
      ],
    });

    const [fila] = await servicio.overview(semana, admin);

    expect(fila.settlementStatus).toBe('confirmed');
    expect(fila.employeeGrossPay).toBe(555);
    expect(fila.netEmployeePay).toBe(500);
  });

  it('compara las ventas con las del periodo anterior', async () => {
    const servicio = montar({
      registros: [registro({ serviceTotal: 1200 })],
      anteriores: [registro({ serviceTotal: 1000 })],
      empleadas: [empleada],
    });

    const [fila] = await servicio.overview(semana, admin);

    expect(fila.salesDeltaPct).toBe(20);
  });

  it('devuelve la lista vacia cuando no hay nadie que mostrar', async () => {
    const servicio = montar({});
    await expect(servicio.overview(semana, admin)).resolves.toEqual([]);
  });
});
