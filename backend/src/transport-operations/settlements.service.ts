import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, In, IsNull, Repository } from 'typeorm';
import { Viajes } from '../trips/entities/trip.entity';
import { EmployeeCashObligation } from './entities/employee-cash-obligation.entity';
import { EmployeeCashPayment, EmployeeCashPaymentAllocation } from './entities/employee-cash-payment.entity';
import { DriverSettlement } from './entities/driver-settlement.entity';
import { Empleadas } from '../employees/entities/employee.entity';
import { Usuarios } from '../users/entities/user.entity';

@Injectable()
export class SettlementsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(EmployeeCashObligation) private readonly obligations: Repository<EmployeeCashObligation>,
    @InjectRepository(DriverSettlement) private readonly driverSettlements: Repository<DriverSettlement>,
    @InjectRepository(Viajes) private readonly trips: Repository<Viajes>,
    @InjectRepository(Empleadas) private readonly employees: Repository<Empleadas>,
  ) {}

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
        ? { employeeId: In(allowed.length ? allowed : ['00000000-0000-0000-0000-000000000000']) }
        : {};
    const rows = await this.obligations.find({ where, order: { createdAt: 'ASC' } });
    const employeeIds = [...new Set(rows.map((row) => row.employeeId))];
    const employees = employeeIds.length ? await this.employees.findBy({ id: In(employeeIds) }) : [];
    return { obligations: rows, employees: employees.map((employee) => ({ id: employee.id, name: employee.nombreArtistico })), total: rows.reduce((sum, row) => sum + Math.max(0, Number(row.amount) - Number(row.paidAmount)), 0) };
  }

  async registerCashPayment(employeeId: string, amount: number, note: string | undefined, actor: Usuarios) {
    await this.assertEmployeeAccess(employeeId, actor);
    return this.dataSource.transaction(async (manager) => {
      const pending = await manager.getRepository(EmployeeCashObligation).find({ where: { employeeId, status: 'pending', calculationStatus: 'ready' }, order: { createdAt: 'ASC' }, lock: { mode: 'pessimistic_write' } });
      const available = pending.reduce((sum, row) => sum + Number(row.amount) - Number(row.paidAmount), 0);
      if (amount > available + 0.001) throw new BadRequestException('El abono supera el saldo pendiente');
      const payment = await manager.getRepository(EmployeeCashPayment).save({ employeeId, amount, note: note ?? null, registeredByUserId: actor.id, origin: 'physical' });
      let remaining = amount;
      for (const obligation of pending) {
        if (remaining <= 0) break;
        const applied = Math.min(remaining, Number(obligation.amount) - Number(obligation.paidAmount));
        obligation.paidAmount = Number(obligation.paidAmount) + applied;
        obligation.status = obligation.paidAmount >= Number(obligation.amount) ? 'paid' : 'pending';
        if (obligation.status === 'paid') obligation.calculationStatus = 'paid';
        obligation.updatedAt = new Date();
        await manager.save(obligation);
        await manager.getRepository(EmployeeCashPaymentAllocation).save({ paymentId: payment.id, obligationId: obligation.id, amount: applied });
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
      throw new ConflictException(row.pendingReason || 'La entrega todavía es provisional');
    }
    const remaining = Number(row.amount) - Number(row.paidAmount);
    if (remaining <= 0) return row;
    await this.registerCashPayment(row.employeeId, remaining, `Cierre del servicio ${row.serviceId}`, actor);
    return this.obligations.findOneByOrFail({ id });
  }

  async driverReport(startDate: string, endDate: string) {
    return this.trips.find({
      where: { proveedorTransporte: 'interno', estado: 'finalizado', horaFinViaje: Between(new Date(`${startDate}T00:00:00Z`), new Date(`${endDate}T23:59:59.999Z`)) },
      relations: { chofer: true, servicio: true }, order: { horaFinViaje: 'ASC' },
    });
  }

  async settleDriver(driverId: string, startDate: string, endDate: string, actorId: string) {
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.getRepository(DriverSettlement).findOneBy({ driverId, weekStart: startDate });
      if (existing?.status === 'paid') throw new ConflictException('La liquidación ya fue pagada');
      const trips = await manager.getRepository(Viajes).find({ where: { choferId: driverId, proveedorTransporte: 'interno', estado: 'finalizado', driverSettlementId: IsNull(), horaFinViaje: Between(new Date(`${startDate}T00:00:00Z`), new Date(`${endDate}T23:59:59.999Z`)) }, lock: { mode: 'pessimistic_write' } });
      const total = trips.reduce((sum, trip) => sum + Number(trip.driverPayout), 0);
      const settlement = await manager.getRepository(DriverSettlement).save({ ...(existing ?? {}), driverId, weekStart: startDate, weekEnd: endDate, total, status: 'paid', paidAt: new Date(), paidByUserId: actorId, updatedAt: new Date() });
      if (trips.length) await manager.getRepository(Viajes).update(trips.map((trip) => trip.id), { driverSettlementId: settlement.id });
      return settlement;
    });
  }
}
