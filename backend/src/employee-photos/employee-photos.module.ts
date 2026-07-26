import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeePhotosService } from './employee-photos.service';
import { EmployeePhotosController } from './employee-photos.controller';
import { EmpleadaFotos } from './entities/employee-photo.entity';
import { Empleadas } from '../employees/entities/employee.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EmpleadaFotos, Empleadas])],
  controllers: [EmployeePhotosController],
  providers: [EmployeePhotosService],
  exports: [EmployeePhotosService],
})
export class EmployeePhotosModule {}
