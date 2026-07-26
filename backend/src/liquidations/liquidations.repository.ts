import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Empleadas } from '../employees/entities/employee.entity';
import { LiquidationRecord } from './entities/liquidation-record.entity';

@Injectable()
export class LiquidationsRepository {
  constructor(
    @InjectRepository(LiquidationRecord)
    private readonly records: Repository<LiquidationRecord>,
    @InjectRepository(Empleadas)
    private readonly employees: Repository<Empleadas>,
  ) {}

  findRecords(startDate: Date, endDate: Date, employeeId?: string) {
    return this.records.find({
      where: {
        occurredAt: Between(startDate, endDate),
        ...(employeeId ? { employeeId } : {}),
      },
      relations: {
        employee: { usuario: true, jefe: true, jefeSecundario: true },
        registeredBy: true,
      },
      order: { occurredAt: 'DESC' },
    });
  }

  findRecord(id: string) {
    return this.records.findOne({ where: { id } });
  }

  findEmployee(id: string) {
    return this.employees.findOne({
      where: { id },
      relations: { usuario: true, jefe: true, jefeSecundario: true },
    });
  }

  createRecord(data: Partial<LiquidationRecord>) {
    return this.records.save(this.records.create(data));
  }

  saveRecord(record: LiquidationRecord) {
    return this.records.save(record);
  }
}
