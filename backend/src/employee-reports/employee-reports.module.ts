import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeReportsController } from './employee-reports.controller';
import { EmployeeReportsService } from './employee-reports.service';
import { EmployeeReportHistory } from './entities/employee-report-history.entity';
import { EmployeeReport } from './entities/employee-report.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EmployeeReport, EmployeeReportHistory])],
  controllers: [EmployeeReportsController],
  providers: [EmployeeReportsService],
  exports: [EmployeeReportsService],
})
export class EmployeeReportsModule {}
