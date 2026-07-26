import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { Usuarios } from '../users/entities/user.entity';
import { CreateLiquidationRecordDto } from './dto/create-liquidation-record.dto';
import { CreateDebtDto, CreateDebtPaymentDto } from './dto/debt.dto';
import { LiquidationPeriodQueryDto } from './dto/liquidation-query.dto';
import { UpdateLiquidationRecordDto } from './dto/update-liquidation-record.dto';
import { LiquidationAudit } from './entities/liquidation-audit.entity';
import { LiquidationDebt } from './entities/liquidation-debt.entity';
import { LiquidationPayment } from './entities/liquidation-payment.entity';
import { LiquidationRecord } from './entities/liquidation-record.entity';
import { buildCutReport, calculateCut } from './liquidation-calculator';
import { EmployeeCashObligation } from '../transport-operations/entities/employee-cash-obligation.entity';
import {
  EmployeeCashPayment,
  EmployeeCashPaymentAllocation,
} from '../transport-operations/entities/employee-cash-payment.entity';
import { EmployeeWeeklySettlement } from './entities/employee-weekly-settlement.entity';
import { LiquidationsRepository } from './liquidations.repository';

@Injectable()
export class LiquidationsService {
  constructor(
    private readonly repository: LiquidationsRepository,
    private readonly dataSource: DataSource,
    @InjectRepository(LiquidationDebt)
    private readonly debts: Repository<LiquidationDebt>,
    @InjectRepository(EmployeeCashObligation)
    private readonly cashObligations: Repository<EmployeeCashObligation>,
    @InjectRepository(EmployeeWeeklySettlement)
    private readonly weeklySettlements: Repository<EmployeeWeeklySettlement>,
  ) {}

  private validatePeriod(query: LiquidationPeriodQueryDto) {
    if (query.startDate >= query.endDate) {
      throw new BadRequestException('startDate debe ser anterior a endDate');
    }
    const days =
      (query.endDate.getTime() - query.startDate.getTime()) / 86_400_000;
    if (days > 366) {
      throw new BadRequestException(
        'El periodo máximo permitido es de 366 días',
      );
    }
  }

  private async assertEmployeeAccess(employeeId: string, actor: Usuarios) {
    const employee = await this.repository.findEmployee(employeeId);
    if (!employee) throw new NotFoundException('Empleada no encontrada');

    const allowed =
      actor.rol === 'admin' ||
      (actor.rol === 'jefe' &&
        [employee.jefeId, employee.jefeSecundarioId].includes(actor.id)) ||
      (actor.rol === 'empleada' && employee.usuarioId === actor.id);
    if (!allowed) {
      throw new ForbiddenException('No tienes acceso a esta empleada');
    }
    return employee;
  }

  async getRecords(query: LiquidationPeriodQueryDto, actor: Usuarios) {
    this.validatePeriod(query);
    if (query.employeeId)
      await this.assertEmployeeAccess(query.employeeId, actor);
    const records = await this.repository.findRecords(
      query.startDate,
      query.endDate,
      query.employeeId,
    );
    return records.filter(
      (record) =>
        actor.rol === 'admin' ||
        (actor.rol === 'jefe' &&
          [record.employee.jefeId, record.employee.jefeSecundarioId].includes(
            actor.id,
          )),
    );
  }

  async getActiveEmployees(query: LiquidationPeriodQueryDto, actor: Usuarios) {
    const records = await this.getRecords(query, actor);
    const unique = new Map<string, LiquidationRecord>();
    for (const record of records) unique.set(record.employeeId, record);
    return [...unique.values()].map(({ employee }) => ({
      id: employee.id,
      userId: employee.usuarioId,
      name: employee.nombreArtistico,
      active: employee.usuario.activo,
      bosses: [employee.jefe, employee.jefeSecundario]
        .filter((boss): boss is Usuarios => boss !== null)
        .map((boss) => ({ id: boss.id, name: boss.nombre ?? boss.email })),
    }));
  }

  async getReport(query: LiquidationPeriodQueryDto, actor: Usuarios) {
    if (!query.employeeId) {
      throw new BadRequestException(
        'employeeId es obligatorio para el reporte',
      );
    }
    const employee = await this.assertEmployeeAccess(query.employeeId, actor);
    const records = await this.getRecords(query, actor);
    const report = buildCutReport(records);
    const weekStart = query.startDate.toISOString().slice(0, 10);
    const existing = await this.weeklySettlements.findOneBy({
      employeeId: employee.id,
      weekStart,
    });
    const obligations = await this.cashObligations.find({
      where: {
        employeeId: employee.id,
        status: 'pending',
        calculationStatus: 'ready',
        serviceDate: LessThanOrEqual(query.endDate),
      },
    });
    const cashOutstanding = obligations.reduce(
      (sum, item) =>
        sum + Math.max(0, Number(item.amount) - Number(item.paidAmount)),
      0,
    );
    const grossEmployeePay = existing
      ? Number(existing.grossEmployeePay)
      : report.finalCut.employeeGrossPay;
    const cashOffset = existing
      ? Number(existing.cashOffset)
      : Math.min(grossEmployeePay, cashOutstanding);
    const netEmployeePay = existing
      ? Number(existing.netEmployeePay)
      : grossEmployeePay - cashOffset;
    report.finalCut = {
      ...report.finalCut,
      result: -netEmployeePay,
      direction: netEmployeePay > 0 ? 'company_owes_employee' : 'settled',
    };
    return {
      employee: { id: employee.id, name: employee.nombreArtistico },
      period: { startDate: query.startDate, endDate: query.endDate },
      ...report,
      weeklySettlement: {
        status: existing ? 'confirmed' : 'preview',
        grossEmployeePay,
        cashOutstanding,
        cashOffset,
        netEmployeePay,
        remainingCashDebt: existing
          ? Number(existing.remainingCashDebt)
          : Math.max(0, cashOutstanding - cashOffset),
        confirmedAt: existing?.confirmedAt ?? null,
      },
    };
  }

  async confirmWeeklySettlement(
    query: LiquidationPeriodQueryDto,
    actor: Usuarios,
  ) {
    if (!query.employeeId)
      throw new BadRequestException('employeeId es obligatorio');
    if (actor.rol !== 'admin')
      throw new ForbiddenException(
        'Solo un administrador puede confirmar la liquidación semanal',
      );
    this.validatePeriod(query);
    await this.assertEmployeeAccess(query.employeeId, actor);
    const records = await this.getRecords(query, actor);
    const grossEmployeePay = calculateCut(records).employeeGrossPay;
    const weekStart = query.startDate.toISOString().slice(0, 10);
    const weekEnd = query.endDate.toISOString().slice(0, 10);
    return this.dataSource.transaction(async (manager) => {
      const settlements = manager.getRepository(EmployeeWeeklySettlement);
      const existing = await settlements.findOneBy({
        employeeId: query.employeeId!,
        weekStart,
      });
      if (existing)
        throw new ConflictException('La liquidación semanal ya fue confirmada');
      const obligations = await manager
        .getRepository(EmployeeCashObligation)
        .find({
          where: {
            employeeId: query.employeeId!,
            status: 'pending',
            calculationStatus: 'ready',
            serviceDate: LessThanOrEqual(query.endDate),
          },
          order: { serviceDate: 'ASC', createdAt: 'ASC' },
          lock: { mode: 'pessimistic_write' },
        });
      const outstanding = obligations.reduce(
        (sum, item) => sum + Number(item.amount) - Number(item.paidAmount),
        0,
      );
      const cashOffset = Math.min(grossEmployeePay, outstanding);
      let remainingOffset = cashOffset;
      if (cashOffset > 0) {
        const payment = await manager.getRepository(EmployeeCashPayment).save({
          employeeId: query.employeeId!,
          amount: cashOffset,
          note: `Compensación del corte ${weekStart}`,
          registeredByUserId: actor.id,
          origin: 'weekly_offset',
        });
        for (const obligation of obligations) {
          if (remainingOffset <= 0) break;
          const amount = Math.min(
            remainingOffset,
            Number(obligation.amount) - Number(obligation.paidAmount),
          );
          obligation.paidAmount = Number(obligation.paidAmount) + amount;
          obligation.status =
            obligation.paidAmount >= Number(obligation.amount)
              ? 'paid'
              : 'pending';
          if (obligation.status === 'paid')
            obligation.calculationStatus = 'paid';
          obligation.updatedAt = new Date();
          await manager.save(obligation);
          await manager.getRepository(EmployeeCashPaymentAllocation).save({
            paymentId: payment.id,
            obligationId: obligation.id,
            amount,
          });
          remainingOffset -= amount;
        }
      }
      const settlement = await settlements.save({
        employeeId: query.employeeId!,
        weekStart,
        weekEnd,
        grossEmployeePay,
        cashOffset,
        netEmployeePay: grossEmployeePay - cashOffset,
        remainingCashDebt: outstanding - cashOffset,
        confirmedByUserId: actor.id,
      });
      await this.auditWithManager(
        manager,
        'weekly_settlement',
        settlement.id,
        'confirmed',
        actor.id,
        null,
        settlement,
      );
      return settlement;
    });
  }

  async createRecord(dto: CreateLiquidationRecordDto, actor: Usuarios) {
    await this.assertEmployeeAccess(dto.employeeId, actor);
    const record = await this.repository.createRecord({
      ...dto,
      sourceRole: actor.rol as 'admin' | 'jefe' | 'empleada',
      registeredByUserId: actor.id,
      cardAmounts: dto.cardAmounts ?? [],
    });
    await this.audit('record', record.id, 'created', actor.id, null, record);
    return record;
  }

  async updateRecord(
    id: string,
    dto: UpdateLiquidationRecordDto,
    actor: Usuarios,
  ) {
    const record = await this.repository.findRecord(id);
    if (!record) throw new NotFoundException('Registro no encontrado');
    await this.assertEmployeeAccess(record.employeeId, actor);
    const before = { ...record };
    Object.assign(record, dto, { updatedAt: new Date() });
    const updated = await this.repository.saveRecord(record);
    await this.audit('record', id, 'updated', actor.id, before, updated);
    return updated;
  }

  async listDebts(employeeId: string, actor: Usuarios) {
    await this.assertEmployeeAccess(employeeId, actor);
    const debts = await this.debts.find({
      where: { employeeId, deletedAt: IsNull() },
      relations: { payments: true },
      order: { createdAt: 'DESC' },
    });
    return debts.map((debt) => this.serializeDebt(debt));
  }

  async createDebt(employeeId: string, dto: CreateDebtDto, actor: Usuarios) {
    await this.assertEmployeeAccess(employeeId, actor);
    const debt = await this.debts.save(
      this.debts.create({
        employeeId,
        amount: dto.amount,
        description: dto.description.trim(),
        createdByUserId: actor.id,
        status: 'pending',
      }),
    );
    await this.audit('debt', debt.id, 'created', actor.id, null, debt);
    return this.serializeDebt({ ...debt, payments: [] });
  }

  async deleteDebt(employeeId: string, debtId: string, actor: Usuarios) {
    await this.assertEmployeeAccess(employeeId, actor);
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(LiquidationDebt);
      const debt = await repository.findOne({
        where: { id: debtId, employeeId, deletedAt: IsNull() },
        relations: { payments: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!debt) throw new NotFoundException('Deuda no encontrada');
      debt.deletedAt = new Date();
      debt.updatedAt = new Date();
      await repository.save(debt);
      await this.auditWithManager(
        manager,
        'debt',
        debt.id,
        'deleted',
        actor.id,
        debt,
        null,
      );
    });
  }

  async addPayment(
    employeeId: string,
    debtId: string,
    dto: CreateDebtPaymentDto,
    actor: Usuarios,
  ) {
    await this.assertEmployeeAccess(employeeId, actor);
    return this.dataSource.transaction(async (manager) => {
      const debtRepository = manager.getRepository(LiquidationDebt);
      const paymentRepository = manager.getRepository(LiquidationPayment);
      const debt = await debtRepository.findOne({
        where: { id: debtId, employeeId, deletedAt: IsNull() },
        relations: { payments: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!debt) throw new NotFoundException('Deuda no encontrada');
      const paid = this.activePaidTotal(debt.payments);
      if (paid + dto.amount > debt.amount) {
        throw new ConflictException('El abono supera el saldo pendiente');
      }
      const payment = await paymentRepository.save(
        paymentRepository.create({
          debtId,
          amount: dto.amount,
          note: dto.note?.trim() || null,
          createdByUserId: actor.id,
        }),
      );
      debt.payments.push(payment);
      debt.status = paid + payment.amount >= debt.amount ? 'paid' : 'pending';
      debt.updatedAt = new Date();
      await debtRepository.save(debt);
      await this.auditWithManager(
        manager,
        'payment',
        payment.id,
        'created',
        actor.id,
        null,
        payment,
      );
      return this.serializeDebt(debt);
    });
  }

  async deletePayment(
    employeeId: string,
    debtId: string,
    paymentId: string,
    actor: Usuarios,
  ) {
    await this.assertEmployeeAccess(employeeId, actor);
    return this.dataSource.transaction(async (manager) => {
      const debtRepository = manager.getRepository(LiquidationDebt);
      const paymentRepository = manager.getRepository(LiquidationPayment);
      const debt = await debtRepository.findOne({
        where: { id: debtId, employeeId, deletedAt: IsNull() },
        relations: { payments: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!debt) throw new NotFoundException('Deuda no encontrada');
      const payment = debt.payments.find(
        (item) => item.id === paymentId && !item.deletedAt,
      );
      if (!payment) throw new NotFoundException('Abono no encontrado');
      payment.deletedAt = new Date();
      await paymentRepository.save(payment);
      debt.status = 'pending';
      debt.updatedAt = new Date();
      await debtRepository.save(debt);
      await this.auditWithManager(
        manager,
        'payment',
        payment.id,
        'deleted',
        actor.id,
        payment,
        null,
      );
      return this.serializeDebt(debt);
    });
  }

  private activePaidTotal(payments: LiquidationPayment[] = []) {
    return payments
      .filter((payment) => !payment.deletedAt)
      .reduce((sum, payment) => sum + Number(payment.amount), 0);
  }

  private serializeDebt(debt: LiquidationDebt) {
    const payments = (debt.payments ?? []).filter(
      (payment) => !payment.deletedAt,
    );
    const paidAmount = this.activePaidTotal(payments);
    return {
      ...debt,
      payments,
      paidAmount,
      remainingAmount: Math.max(0, Number(debt.amount) - paidAmount),
    };
  }

  private audit(
    entityType: LiquidationAudit['entityType'],
    entityId: string,
    action: LiquidationAudit['action'],
    actorUserId: string,
    beforeValue: object | null,
    afterValue: object | null,
  ) {
    return this.auditWithManager(
      this.dataSource.manager,
      entityType,
      entityId,
      action,
      actorUserId,
      beforeValue,
      afterValue,
    );
  }

  private auditWithManager(
    manager: DataSource['manager'],
    entityType: LiquidationAudit['entityType'],
    entityId: string,
    action: LiquidationAudit['action'],
    actorUserId: string,
    beforeValue: object | null,
    afterValue: object | null,
  ) {
    const repository = manager.getRepository(LiquidationAudit);
    return repository.save(
      repository.create({
        entityType,
        entityId,
        action,
        actorUserId,
        beforeValue: beforeValue as Record<string, unknown> | null,
        afterValue: afterValue as Record<string, unknown> | null,
      }),
    );
  }
}
