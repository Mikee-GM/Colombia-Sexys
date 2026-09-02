import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThanOrEqual, Repository } from 'typeorm';

import { Empleadas } from '../employees/entities/employee.entity';
import { Usuarios } from '../users/entities/user.entity';
import { fromCents, toCents } from '../common/money';
import { EmployeeCashObligation } from '../transport-operations/entities/employee-cash-obligation.entity';
import { EmployeeCashPayment } from '../transport-operations/entities/employee-cash-payment.entity';
import { LiquidationPeriodQueryDto } from './dto/liquidation-query.dto';
import { EmployeeWeeklySettlement } from './entities/employee-weekly-settlement.entity';
import { LiquidationDebt } from './entities/liquidation-debt.entity';
import { LiquidationRecord } from './entities/liquidation-record.entity';
import { calculateCut } from './liquidation-calculator';
import { LiquidationsService } from './liquidations.service';

/** Cuantos periodos hacia atras dibuja la tendencia de la ficha. */
const SEMANAS_DE_TENDENCIA = 8;

/**
 * Todo el dinero de una empleada, en una sola lectura.
 *
 * Antes cada cifra vivia en una pantalla distinta —el corte en liquidaciones,
 * el efectivo sin entregar en transporte, las deudas en cartera— y ninguna
 * sabia de las otras. Para responder "cuanto le pago hoy a esta persona" habia
 * que abrir tres sitios y restar a mano, y el resultado dependia de acordarse
 * de mirar los tres.
 *
 * Este servicio no calcula nada nuevo: reune lo que ya existe y le pone encima
 * las derivadas que hacen legible el numero (ticket promedio, dias trabajados,
 * comparativa con el periodo anterior). El calculo del corte sigue siendo el de
 * `calculateCut`, que es la unica fuente de verdad del reparto.
 */
@Injectable()
export class EmployeeMoneyService {
  constructor(
    private readonly liquidations: LiquidationsService,
    @InjectRepository(Empleadas)
    private readonly employees: Repository<Empleadas>,
    @InjectRepository(LiquidationDebt)
    private readonly debts: Repository<LiquidationDebt>,
    @InjectRepository(EmployeeCashObligation)
    private readonly obligations: Repository<EmployeeCashObligation>,
    @InjectRepository(EmployeeCashPayment)
    private readonly cashPayments: Repository<EmployeeCashPayment>,
    @InjectRepository(EmployeeWeeklySettlement)
    private readonly settlements: Repository<EmployeeWeeklySettlement>,
  ) {}

  /**
   * El periodo anterior del mismo tamaño.
   *
   * La comparativa se construye desplazando el rango que ya pidio quien llama,
   * en vez de calcular semanas naturales: asi el "-12 %" siempre compara cosas
   * del mismo largo, incluso si la pantalla pide un rango que no es una semana.
   */
  private periodoAnterior(query: LiquidationPeriodQueryDto) {
    const duracion = query.endDate.getTime() - query.startDate.getTime();
    return {
      startDate: new Date(query.startDate.getTime() - duracion),
      endDate: new Date(query.endDate.getTime() - duracion),
      employeeId: query.employeeId,
    } as LiquidationPeriodQueryDto;
  }

  /**
   * Variacion porcentual, con el caso de partir de cero resuelto.
   *
   * Sin base no hay porcentaje que signifique algo: pasar de 0 a 5000 no es un
   * aumento del infinito por ciento, es la primera semana con actividad. Se
   * devuelve `null` y la pantalla escribe "sin comparativa" en vez de un numero
   * que enganaria.
   */
  private variacion(actual: number, anterior: number): number | null {
    if (anterior === 0) return null;
    return Math.round(((actual - anterior) / Math.abs(anterior)) * 1000) / 10;
  }

  /** Deuda viva de cada empleada, ya descontados los abonos no anulados. */
  private async deudaPorEmpleada(employeeIds?: string[]) {
    const deudas = await this.debts.find({
      where: {
        deletedAt: IsNull(),
        status: 'pending',
        ...(employeeIds ? { employeeId: In(employeeIds) } : {}),
      },
      relations: { payments: true },
    });

    const porEmpleada = new Map<string, number>();
    for (const deuda of deudas) {
      const abonado = (deuda.payments ?? [])
        .filter((pago) => !pago.deletedAt)
        .reduce((suma, pago) => suma + toCents(pago.amount), 0);
      const vivo = Math.max(0, toCents(deuda.amount) - abonado);
      porEmpleada.set(
        deuda.employeeId,
        (porEmpleada.get(deuda.employeeId) ?? 0) + vivo,
      );
    }
    return porEmpleada;
  }

  /** Efectivo cobrado al cliente que la empleada todavia no ha entregado. */
  private async efectivoPorEmpleada(hasta: Date, employeeIds?: string[]) {
    const pendientes = await this.obligations.find({
      where: {
        status: 'pending',
        calculationStatus: 'ready',
        serviceDate: LessThanOrEqual(hasta),
        ...(employeeIds ? { employeeId: In(employeeIds) } : {}),
      },
    });

    const porEmpleada = new Map<string, number>();
    for (const fila of pendientes) {
      const vivo = Math.max(0, toCents(fila.amount) - toCents(fila.paidAmount));
      porEmpleada.set(
        fila.employeeId,
        (porEmpleada.get(fila.employeeId) ?? 0) + vivo,
      );
    }
    return porEmpleada;
  }

  /**
   * Listado de personal con su situacion de dinero en el periodo.
   *
   * Aparece quien tuvo actividad, pero tambien quien no la tuvo y sigue
   * debiendo algo: una empleada que no trabajo esta semana y arrastra una deuda
   * es justo a quien no se puede perder de vista, y con un listado construido
   * solo desde los registros del periodo desaparecia de la pantalla.
   */
  async overview(query: LiquidationPeriodQueryDto, actor: Usuarios) {
    const registros = await this.liquidations.getRecords(
      { ...query, employeeId: undefined },
      actor,
    );
    const anteriores = await this.liquidations.getRecords(
      { ...this.periodoAnterior(query), employeeId: undefined },
      actor,
    );

    const porEmpleada = new Map<string, LiquidationRecord[]>();
    for (const registro of registros) {
      const grupo = porEmpleada.get(registro.employeeId) ?? [];
      grupo.push(registro);
      porEmpleada.set(registro.employeeId, grupo);
    }
    const ventasAnteriores = new Map<string, number>();
    for (const registro of anteriores) {
      if (registro.cancelled || registro.isFine) continue;
      ventasAnteriores.set(
        registro.employeeId,
        (ventasAnteriores.get(registro.employeeId) ?? 0) +
          toCents(registro.serviceTotal),
      );
    }

    const [deudas, efectivo] = await Promise.all([
      this.deudaPorEmpleada(),
      this.efectivoPorEmpleada(query.endDate),
    ]);

    /*
     * El universo de la pantalla: actividad en el periodo, deuda viva o
     * efectivo sin entregar. El filtro por rol lo aplica `getRecords` para los
     * registros, y aqui se repite sobre los saldos leyendo las empleadas.
     */
    const candidatas = new Set<string>([
      ...porEmpleada.keys(),
      ...deudas.keys(),
      ...efectivo.keys(),
    ]);
    if (!candidatas.size) return [];

    const empleadas = await this.employees.find({
      where: { id: In([...candidatas]) },
      relations: { usuario: true },
    });
    const visibles = empleadas.filter(
      (empleada) =>
        actor.rol === 'admin' ||
        (actor.rol === 'jefe' &&
          [empleada.jefeId, empleada.jefeSecundarioId].includes(actor.id)),
    );

    const weekStart = query.startDate.toISOString().slice(0, 10);
    const confirmadas = await this.settlements.find({
      where: { employeeId: In(visibles.map((item) => item.id)), weekStart },
    });
    const confirmadaPor = new Map(
      confirmadas.map((item) => [item.employeeId, item]),
    );

    return visibles
      .map((empleada) => {
        const cut = calculateCut(porEmpleada.get(empleada.id) ?? []);
        const confirmada = confirmadaPor.get(empleada.id);
        const efectivoPendiente = fromCents(efectivo.get(empleada.id) ?? 0);
        const deudaViva = fromCents(deudas.get(empleada.id) ?? 0);

        const brutoEmpleada = confirmada
          ? Number(confirmada.grossEmployeePay)
          : cut.employeeGrossPay;
        const compensado = confirmada
          ? Number(confirmada.cashOffset)
          : Math.min(brutoEmpleada, efectivoPendiente);
        const netoEmpleada = confirmada
          ? Number(confirmada.netEmployeePay)
          : brutoEmpleada - compensado;

        return {
          employeeId: empleada.id,
          employeeName: empleada.nombreArtistico,
          realName: empleada.nombreReal,
          active: empleada.usuario?.activo ?? true,
          servicesCount: cut.count,
          salesTotal: cut.salesTotal,
          totalCollected: cut.totalCollected,
          companyCommission: cut.companyCommission,
          finesTotal: cut.finesTotal,
          employeeGrossPay: brutoEmpleada,
          cashOffset: compensado,
          netEmployeePay: netoEmpleada,
          cashOutstanding: efectivoPendiente,
          debtOutstanding: deudaViva,
          /*
           * El numero que responde "que hago hoy con esta persona": lo que se
           * le paga menos lo que debe. El efectivo ya esta descontado dentro de
           * `netEmployeePay`, asi que restarlo otra vez lo contaria dos veces.
           */
          balance: fromCents(toCents(netoEmpleada) - toCents(deudaViva)),
          settlementStatus: confirmada
            ? ('confirmed' as const)
            : ('preview' as const),
          confirmedAt: confirmada?.confirmedAt ?? null,
          salesDeltaPct: this.variacion(
            cut.salesTotal,
            fromCents(ventasAnteriores.get(empleada.id) ?? 0),
          ),
        };
      })
      .sort((a, b) => b.balance - a.balance);
  }

  /** Metricas derivadas del periodo: lo que el corte no dice por si solo. */
  private rendimiento(registros: LiquidationRecord[]) {
    const servicios = registros.filter(
      (registro) => !registro.isFine && !registro.cancelled,
    );
    const cancelados = registros.filter(
      (registro) => !registro.isFine && registro.cancelled,
    );
    const multas = registros.filter((registro) => registro.isFine);

    const ventas = servicios.reduce(
      (suma, registro) => suma + toCents(registro.serviceTotal),
      0,
    );
    const dias = new Set(
      servicios.map((registro) =>
        new Date(registro.occurredAt).toISOString().slice(0, 10),
      ),
    );
    const conActividad = servicios.length + cancelados.length;

    return {
      servicesCount: servicios.length,
      cancelledCount: cancelados.length,
      finesCount: multas.length,
      cancelRate: conActividad
        ? Math.round((cancelados.length / conActividad) * 1000) / 10
        : 0,
      averageTicket: servicios.length
        ? fromCents(Math.round(ventas / servicios.length))
        : 0,
      daysWorked: dias.size,
      servicesPerActiveDay: dias.size
        ? Math.round((servicios.length / dias.size) * 10) / 10
        : 0,
    };
  }

  /**
   * Tendencia de los ultimos periodos.
   *
   * Se leen de una sola consulta y se reparten en cubos, en vez de pedir una
   * consulta por semana: son ocho viajes a la base para dibujar ocho barras.
   */
  private async tendencia(query: LiquidationPeriodQueryDto, actor: Usuarios) {
    const duracion = query.endDate.getTime() - query.startDate.getTime();
    const desde = new Date(
      query.startDate.getTime() - duracion * (SEMANAS_DE_TENDENCIA - 1),
    );
    const registros = await this.liquidations.getRecords(
      { ...query, startDate: desde },
      actor,
    );

    const cubos = Array.from({ length: SEMANAS_DE_TENDENCIA }, (_, indice) => {
      const inicio = new Date(desde.getTime() + duracion * indice);
      return {
        weekStart: inicio.toISOString().slice(0, 10),
        inicio,
        fin: new Date(inicio.getTime() + duracion),
        registros: [] as LiquidationRecord[],
      };
    });

    for (const registro of registros) {
      const momento = new Date(registro.occurredAt).getTime();
      const cubo = cubos.find(
        (item) =>
          momento >= item.inicio.getTime() && momento <= item.fin.getTime(),
      );
      if (cubo) cubo.registros.push(registro);
    }

    return cubos.map((cubo) => {
      const cut = calculateCut(cubo.registros);
      return {
        weekStart: cubo.weekStart,
        salesTotal: cut.salesTotal,
        employeeGrossPay: cut.employeeGrossPay,
        servicesCount: cut.count,
      };
    });
  }

  /**
   * Ficha completa de dinero de una empleada.
   *
   * Devuelve el corte, los saldos vivos, el historial de movimientos y las
   * derivadas de rendimiento en una sola respuesta, porque la pantalla los
   * muestra juntos y pedirlos por separado dejaria cifras de momentos
   * distintos conviviendo en la misma vista.
   */
  async detail(query: LiquidationPeriodQueryDto, actor: Usuarios) {
    if (!query.employeeId) {
      throw new BadRequestException('employeeId es obligatorio');
    }

    const [reporte, registros, previos, tendencia, deudas] = await Promise.all([
      this.liquidations.getReport(query, actor),
      this.liquidations.getRecords(query, actor),
      this.liquidations.getRecords(this.periodoAnterior(query), actor),
      this.tendencia(query, actor),
      this.liquidations.listDebts(query.employeeId, actor),
    ]);

    const cutPrevio = calculateCut(previos);
    const cut = reporte.finalCut;
    const [obligaciones, abonos] = await Promise.all([
      this.obligations.find({
        where: { employeeId: query.employeeId },
        order: { serviceDate: 'DESC' },
      }),
      this.cashPayments.find({
        where: { employeeId: query.employeeId },
        order: { createdAt: 'DESC' },
      }),
    ]);

    const deudaViva = deudas.reduce(
      (suma, deuda) => suma + toCents(deuda.remainingAmount),
      0,
    );
    const netoEmpleada = reporte.weeklySettlement.netEmployeePay;

    return {
      ...reporte,
      performance: this.rendimiento(registros),
      paymentMix: {
        cash: cut.cashTotal,
        transfer: cut.transferTotal,
        card: cut.cardTotal,
      },
      comparison: {
        previous: {
          salesTotal: cutPrevio.salesTotal,
          employeeGrossPay: cutPrevio.employeeGrossPay,
          servicesCount: cutPrevio.count,
        },
        deltas: {
          salesTotal: this.variacion(cut.salesTotal, cutPrevio.salesTotal),
          employeeGrossPay: this.variacion(
            cut.employeeGrossPay,
            cutPrevio.employeeGrossPay,
          ),
          servicesCount: this.variacion(cut.count, cutPrevio.count),
        },
      },
      trend: tendencia,
      debts: deudas,
      cashObligations: obligaciones,
      cashPayments: abonos,
      balance: {
        netEmployeePay: fromCents(toCents(netoEmpleada)),
        debtOutstanding: fromCents(deudaViva),
        cashOutstanding: reporte.weeklySettlement.cashOutstanding,
        total: fromCents(toCents(netoEmpleada) - deudaViva),
      },
    };
  }
}
