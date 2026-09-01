import { DisciplineModule } from '../discipline/discipline.module';
import { LocationsModule } from '../locations/locations.module';
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { EmployeePortalController } from './employee-portal.controller';
import { Empleadas } from './entities/employee.entity';
import { Usuarios } from '../users/entities/user.entity';
import { EmpleadaFotos } from '../employee-photos/entities/employee-photo.entity';
import { EmpleadaFotosExclusivas } from '../employee-photos/entities/employee-private-photo.entity';
import { EmployeeCashObligation } from '../transport-operations/entities/employee-cash-obligation.entity';
import { UploadModule } from '../upload/upload.module';
import { WeeklyContentModule } from '../weekly-content/weekly-content.module';
import { AuthModule } from '../auth/auth.module';
import { ServicesModule } from '../services/services.module';

@Module({
  imports: [
    LocationsModule,
    DisciplineModule,
    TypeOrmModule.forFeature([
      Empleadas,
      Usuarios,
      EmpleadaFotos,
      EmpleadaFotosExclusivas,
      EmployeeCashObligation,
    ]),
    UploadModule,
    WeeklyContentModule,
    AuthModule,
    // Por ServicesService, que respalda las acciones del portal sobre un
    // servicio. Va con forwardRef porque services ya alcanza a employees por
    // la cadena de liquidaciones.
    forwardRef(() => ServicesModule),
  ],
  controllers: [EmployeesController, EmployeePortalController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
