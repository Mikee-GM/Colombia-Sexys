import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { Empleadas } from './entities/employee.entity';
import { Usuarios } from '../users/entities/user.entity';
import { EmpleadaFotos } from '../employee-photos/entities/employee-photo.entity';
import { EmpleadaFotosExclusivas } from '../employee-photos/entities/employee-private-photo.entity';
import { UploadModule } from '../upload/upload.module';
import { WeeklyContentModule } from '../weekly-content/weekly-content.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Empleadas,
      Usuarios,
      EmpleadaFotos,
      EmpleadaFotosExclusivas,
    ]),
    UploadModule,
    WeeklyContentModule,
  ],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
