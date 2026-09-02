import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, In, IsNull, Repository } from 'typeorm';
import { Viajes } from '../trips/entities/trip.entity';
import { EmployeeCashObligation } from './entities/employee-cash-obligation.entity';
import {
  EmployeeCashPayment,
  EmployeeCashPaymentAllocation,
} from './entities/employee-cash-payment.entity';
import { DriverSettlement } from './entities/driver-settlement.entity';
import { Empleadas } from '../employees/entities/employee.entity';
import { Choferes } from '../drivers/entities/driver.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { AVISO_LIQUIDACION } from '../notifications/avisos-catalogo';
import { Usuarios } from '../users/entities/user.entity';
import { LiquidationAudit } from '../liquidations/entities/liquidation-audit.entity';

@Injectable()
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(EmployeeCashObligation)
    private readonly obligations: Repository<EmployeeCashObligation>,
    @InjectRepository(DriverSettlement)
    private readonly driverSettlements: Repository<DriverSettlement>,
    @InjectRepository(Viajes) private readonly trips: Repository<Viajes>,
    @InjectRepository(Empleadas)
    private readonly employees: Repository<Empleadas>,
    @InjectRepository(Choferes)
    private readonly drivers: Repository<Choferes>,
    private readonly notifications: NotificationsService,
  ) {}

  private getWeekBounds(date: Date): { weekStart: string; weekEnd: string } {
    const d = new Date(date);
    const day = d.getDay();
    const adjustedDay = day === 0 ? 7 : day;
    const diff = d.getDate() - adjustedDay + 1;
    const start = new Date(d);
    start.setDate(diff);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    const toDateOnly = (value: Date) => value.toISOString().slice(0, 10);
    return { weekStart: toDateOnly(start), weekEnd: toDateOnly(end) };
  }

  private async allowedEmployeeIds(actor: Usuarios): Promise<string[] | null> {
    if (actor.rol === 'admin') return null;
    const employees = await this.employees.find({
      where: [{ jefeId: actor.id }, { jefeSecundarioId: actor.id }],
      select: { id: true },
    });
    return employees.map((employee) => employee.id);
  }

  private async assertEmployeeAccess(employeeId: string, actor: Usuarios) {
    const allowed = await this.allowedEmployeeIds(actor);
    if (allowed && !allowed.includes(employeeId)) {
      throw new ConflictException('La empleada no pertenece a tu equipo');
    }
  }

  async cashSummary(actor: Usuarios, employeeId?: string) {
    const allowed = await this.allowedEmployeeIds(actor);
    if (employeeId) await this.assertEmployeeAccess(employeeId, actor);
    const where = employeeId
      ? { employeeId }
      : allowed
        ? {
            employeeId: In(
              allowed.length
                ? allowed
                : ['00000000-0000-0000-0000-000000000000'],
            ),
          }
        : {};
    const rows = await this.obligations.find({
      where,
      order: { createdAt: 'ASC' },
    });
    const employeeIds = [...new Set(rows.map((row) => row.employeeId))];
    const employees = employeeIds.length
      ? await this.employees.findBy({ id: In(employeeIds) })
      : [];
    return {
      obligations: rows,
      employees: employees.map((employee) => ({
        id: employee.id,
        name: employee.nombreArtistico,
      })),
      total: rows.reduce(
        (sum, row) =>
          sum + Math.max(0, Number(row.amount) - Number(row.paidAmount)),
        0,
      ),
    };
  }

  async registerCashPayment(
    employeeId: string,
    amount: number,
    note: string | undefined,
    actor: Usuarios,
  ) {
    await this.assertEmployeeAccess(employeeId, actor);
    const resultado = await this.dataSource.transaction(async (manager) => {
      const pending = await manager.getRepository(EmployeeCashObligation).find({
        where: { employeeId, status: 'pending', calculationStatus: 'ready' },
        order: { createdAt: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      const available = pending.reduce(
        (sum, row) => sum + Number(row.amount) - Number(row.paidAmount),
        0,
      );
      if (amount > available + 0.001)
        throw new BadRequestException('El abono supera el saldo pendiente');
      const payment = await manager.getRepository(EmployeeCashPayment).save({
        employeeId,
        amount,
        note: note ?? null,
        registeredByUserId: actor.id,
        origin: 'physical',
      });
      let remaining = amount;
      for (const obligation of pending) {
        if (remaining <= 0) break;
        const applied = Math.min(
          remaining,
          Number(obligation.amount) - Number(obligation.paidAmount),
        );
        obligation.paidAmount = Number(obligation.paidAmount) + applied;
        obligation.status =
          obligation.paidAmount >= Number(obligation.amount)
            ? 'paid'
            : 'pending';
        if (obligation.status === 'paid') obligation.calculationStatus = 'paid';
        obligation.updatedAt = new Date();
        await manager.save(obligation);
        await manager.getRepository(EmployeeCashPaymentAllocation).save({
          paymentId: payment.id,
          obligationId: obligation.id,
          amount: applied,
        });
        remaining -= applied;
      }
      return payment;
    });
  }

  async closeCashObligation(id: string, actor: Usuarios) {
    const row = await this.obligations.findOneBy({ id });
    if (!row) throw new NotFoundException('Obligación no encontrada');
    await this.assertEmployeeAccess(row.employeeId, actor);
    if (row.calculationStatus !== 'ready') {
      throw new ConflictException(
        row.pendingReason || 'La entrega todavía es provisional',
      );
    }
    const remaining = Number(row.amount) - Number(row.paidAmount);
    if (remaining <= 0) return row;
    await this.registerCashPayment(
      row.employeeId,
      remaining,
      `Cierre del servicio ${row.serviceId}`,
      actor,
    );
    return this.obligations.findOneByOrFail({ id });
  }

  /**
   * Abonos de efectivo de una empleada, para el historial de su ficha.
   *
   * Incluye los revertidos: son justamente lo que hay que poder ver para
   * entender por que un saldo cambio de un dia para otro.
   */
  async cashPayments(employeeId: string, actor: Usuarios) {
    await this.assertEmployeeAccess(employeeId, actor);
    return this.dataSource.getRepository(EmployeeCashPayment).find({
      where: { employeeId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Deshace un abono de efectivo.
   *
   * Se puede hacer sin adivinar nada porque `employee_cash_payment_allocations`
   * guarda que obligacion toco el abono y por cuanto: revertir es restar cada
   * asignacion de la obligacion correspondiente. Las filas de asignacion se
   * conservan —son la prueba de lo que se deshizo— y quien manda a partir de
   * aqui es la marca `revertedAt` del abono.
   *
   * Los abonos con origen `weekly_offset` no se revierten por aqui: los crea la
   * confirmacion del corte semanal, y deshacer solo el abono dejaria la fila de
   * la liquidacion diciendo que se pago algo que ya no esta pagado. Su entrada
   * es deshacer la liquidacion entera, que llama aqui con `permitirOffset`.
   */
  async revertCashPayment(
    paymentId: string,
    actor: Usuarios,
    reason?: string,
    permitirOffset = false,
  ) {
    return this.dataSource.transaction((manager) =>
      this.revertCashPaymentWith(
        manager,
        paymentId,
        actor,
        reason,
        permitirOffset,
      ),
    );
  }

  /**
   * La reversa en si, sobre un `EntityManager` que pone quien llama.
   *
   * Existe aparte porque deshacer la liquidacion semanal tiene que revertir el
   * abono y borrar la fila del corte en la misma transaccion: si solo una de
   * las dos cuajara, el efectivo quedaria contado como entregado sin corte que
   * lo respalde, o al reves.
   */
  async revertCashPaymentWith(
    manager: DataSource['manager'],
    paymentId: string,
    actor: Usuarios,
    reason?: string,
    permitirOffset = false,
  ) {
    const payments = manager.getRepository(EmployeeCashPayment);
    const payment = await payments.findOne({
      where: { id: paymentId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!payment) throw new NotFoundException('Abono no encontrado');
    await this.assertEmployeeAccess(payment.employeeId, actor);
    if (payment.revertedAt) {
      throw new ConflictException('El abono ya estaba revertido');
    }
    if (payment.origin === 'weekly_offset' && !permitirOffset) {
      throw new ConflictException(
        'Este abono lo generó el corte semanal: deshaz la liquidación de la semana',
      );
    }

    const allocations = await manager
      .getRepository(EmployeeCashPaymentAllocation)
      .findBy({ paymentId: payment.id });

    for (const allocation of allocations) {
      const obligation = await manager
        .getRepository(EmployeeCashObligation)
        .findOne({
          where: { id: allocation.obligationId },
          lock: { mode: 'pessimistic_write' },
        });
      if (!obligation) continue;
      obligation.paidAmount = Math.max(
        0,
        Number(obligation.paidAmount) - Number(allocation.amount),
      );
      obligation.status =
        obligation.paidAmount >= Number(obligation.amount) ? 'paid' : 'pending';
      /*
       * Vuelve a `ready`, no a `provisional`: el abono solo pudo aplicarse
       * sobre una obligacion ya calculada, asi que ese es su estado previo.
       */
      obligation.calculationStatus =
        obligation.status === 'paid' ? 'paid' : 'ready';
      obligation.updatedAt = new Date();
      await manager.save(obligation);
    }

    const antes = { ...payment };
    payment.revertedAt = new Date();
    payment.revertedByUserId = actor.id;
    payment.revertedReason = reason?.trim() || null;
    await payments.save(payment);

    /*
     * El asiento va al mismo registro que el resto del dinero
     * (`liquidation_audit_log`), aunque el abono viva en transporte: para
     * responder "quien movio este saldo y cuando" hace falta un solo sitio
     * donde mirar, no uno por modulo.
     */
    const auditoria = manager.getRepository(LiquidationAudit);
    await auditoria.save(
      auditoria.create({
        entityType: 'cash_payment',
        entityId: payment.id,
        action: 'reverted',
        actorUserId: actor.id,
        beforeValue: antes as unknown as Record<string, unknown>,
        afterValue: payment as unknown as Record<string, unknown>,
      }),
    );

    return payment;
  }

  async driverReport(startDate: string, endDate: string) {
    return this.trips.find({
      where: {
        proveedorTransporte: 'interno',
        estado: 'finalizado',
        horaFinViaje: Between(
          new Date(`${startDate}T00:00:00Z`),
          new Date(`${endDate}T23:59:59.999Z`),
        ),
      },
      relations: { chofer: true, servicio: true },
      order: { horaFinViaje: 'ASC' },
    });
  }

  /**
   * Reabre una semana ya pagada de un chofer.
   *
   * La liquidacion de una modelo se podia deshacer desde el principio; la del
   * chofer no, y no hay razon para la asimetria: los dos casos son el mismo
   * --aparece un viaje que faltaba, o se cerro el periodo equivocado-- y el
   * numero queda mal sin forma de rehacerlo.
   *
   * Deshacer significa soltar los viajes que quedaron colgados de este corte,
   * para que la siguiente liquidacion vuelva a recogerlos. Las dos mitades van
   * en la misma transaccion: un corte marcado como pendiente con los viajes aun
   * enganchados dejaria una semana que nunca se puede volver a cerrar.
   *
   * Reservado al admin, igual que el de la modelo: deshacer mueve dinero en la
   * direccion en la que un error cuesta caro.
   */
  async undoDriverSettlement(
    driverId: string,
    startDate: string,
    actor: Usuarios,
    motivo: string,
  ) {
    if (actor.rol !== 'admin') {
      throw new ForbiddenException(
        'Solo un administrador puede deshacer la liquidación de un chofer',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const settlement = await manager.getRepository(DriverSettlement).findOne({
        where: { driverId, weekStart: startDate },
        lock: { mode: 'pessimistic_write' },
      });
      if (!settlement) {
        throw new NotFoundException('Esa semana no tiene liquidación');
      }
      if (settlement.status !== 'paid') {
        throw new ConflictException('Esa semana no está pagada');
      }

      // Los viajes vuelven a quedar libres: es lo que permite que la proxima
      // liquidacion los recoja con el importe corregido.
      await manager.getRepository(Viajes).update(
        { driverSettlementId: settlement.id },
        {
          driverSettlementId: null,
        },
      );

      const reabierta = await manager.getRepository(DriverSettlement).save({
        ...settlement,
        status: 'pending',
        paidAt: null,
        paidByUserId: null,
        updatedAt: new Date(),
      });

      this.logger.log(
        `Liquidación del chofer ${driverId} de la semana ${startDate} deshecha por ${actor.id}: ${motivo}`,
      );
      return reabierta;
    });
  }

  async settleDriver(
    driverId: string,
    startDate: string,
    endDate: string,
    actorId: string,
  ) {
    const resultado = await this.dataSource.transaction(async (manager) => {
      const existing = await manager
        .getRepository(DriverSettlement)
        .findOneBy({ driverId, weekStart: startDate });
      if (existing?.status === 'paid')
        throw new ConflictException('La liquidación ya fue pagada');
      const trips = await manager.getRepository(Viajes).find({
        where: {
          choferId: driverId,
          proveedorTransporte: 'interno',
          estado: 'finalizado',
          driverSettlementId: IsNull(),
          horaFinViaje: Between(
            new Date(`${startDate}T00:00:00Z`),
            new Date(`${endDate}T23:59:59.999Z`),
          ),
        },
        lock: { mode: 'pessimistic_write' },
      });
      const total = trips.reduce(
        (sum, trip) => sum + Number(trip.driverPayout),
        0,
      );
      const settlement = await manager.getRepository(DriverSettlement).save({
        ...(existing ?? {}),
        driverId,
        weekStart: startDate,
        weekEnd: endDate,
        total,
        status: 'paid',
        paidAt: new Date(),
        paidByUserId: actorId,
        updatedAt: new Date(),
      });
      if (trips.length)
        await manager.getRepository(Viajes).update(
          trips.map((trip) => trip.id),
          { driverSettlementId: settlement.id },
        );
      return settlement;
    });

    /*
     * Nivel 2: es dinero suyo, y hasta ahora se enteraba mirando el portal por
     * su cuenta. En su propio try/catch, que la liquidacion ya esta cerrada.
     */
    const chofer = await this.drivers.findOne({
      where: { id: driverId },
      select: { id: true, usuarioId: true },
    });
    const usuarioId = chofer?.usuarioId;
    if (usuarioId) {
      try {
        await this.notifications.notificar(usuarioId, {
          titulo: 'Tu liquidación está lista',
          cuerpo: 'Toca para ver el detalle de tu pago.',
          url: '/chofer/portal',
          tag: `liquidacion-${resultado.id}`,
          tipo: AVISO_LIQUIDACION,
        });
      } catch (err) {
        this.logger.error(
          'Error enviando el aviso push de la liquidación:',
          err,
        );
      }
    }

    return resultado;
  }

  async syncDriverSettlement(tripId: string): Promise<void> {
    const trip = await this.trips.findOneBy({ id: tripId });
    if (
      !trip ||
      trip.proveedorTransporte !== 'interno' ||
      trip.estado !== 'finalizado' ||
      !trip.choferId ||
      !trip.horaFinViaje
    ) {
      return;
    }
    const { weekStart, weekEnd } = this.getWeekBounds(trip.horaFinViaje);
    const existing = await this.driverSettlements.findOneBy({
      driverId: trip.choferId,
      weekStart,
    });
    if (existing?.status === 'paid') return;
    const trips = await this.trips.find({
      where: {
        choferId: trip.choferId,
        proveedorTransporte: 'interno',
        estado: 'finalizado',
        driverSettlementId: IsNull(),
        horaFinViaje: Between(
          new Date(`${weekStart}T00:00:00Z`),
          new Date(`${weekEnd}T23:59:59.999Z`),
        ),
      },
    });
    const total = trips.reduce(
      (sum, item) => sum + Number(item.driverPayout),
      0,
    );
    await this.driverSettlements.save({
      ...(existing ?? {}),
      driverId: trip.choferId,
      weekStart,
      weekEnd,
      total,
      status: 'pending',
      updatedAt: new Date(),
    });
  }

  async getActiveDrivers(startDate: string, endDate: string) {
    const trips = await this.trips.find({
      where: {
        proveedorTransporte: 'interno',
        estado: 'finalizado',
        horaFinViaje: Between(
          new Date(`${startDate}T00:00:00Z`),
          new Date(`${endDate}T23:59:59.999Z`),
        ),
      },
    });
    const driverIds = [
      ...new Set(
        trips.map((trip) => trip.choferId).filter((id): id is string => !!id),
      ),
    ];
    if (!driverIds.length) return [];
    const drivers = await this.drivers.findBy({ id: In(driverIds) });
    return drivers.map((driver) => ({ id: driver.id, name: driver.nombre }));
  }

  async getDriverReport(driverId: string, startDate: string, endDate: string) {
    const driver = await this.drivers.findOneBy({ id: driverId });
    if (!driver) throw new NotFoundException('Chofer no encontrado');
    const trips = await this.trips.find({
      where: {
        choferId: driverId,
        proveedorTransporte: 'interno',
        estado: 'finalizado',
        horaFinViaje: Between(
          new Date(`${startDate}T00:00:00Z`),
          new Date(`${endDate}T23:59:59.999Z`),
        ),
      },
      order: { horaFinViaje: 'ASC' },
    });
    const existing = await this.driverSettlements.findOneBy({
      driverId,
      weekStart: startDate,
    });
    const totalPay = existing
      ? Number(existing.total)
      : trips.reduce((sum, trip) => sum + Number(trip.driverPayout), 0);
    return {
      driver: { id: driver.id, name: driver.nombre },
      period: { startDate, endDate },
      trips: trips.map((trip) => ({
        id: trip.id,
        tipo: trip.tipo,
        zona: trip.zona,
        driverPayout: Number(trip.driverPayout),
        horaFinViaje: trip.horaFinViaje,
      })),
      weeklySettlement: {
        status: existing ? existing.status : ('preview' as const),
        totalPay,
        confirmedAt: existing?.paidAt ?? null,
      },
    };
  }
}
