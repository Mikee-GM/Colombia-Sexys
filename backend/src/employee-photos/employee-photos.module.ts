import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeePhotosService } from './employee-photos.service';
import { EmployeePhotosController } from './employee-photos.controller';
import { EmpleadaFotos } from './entities/employee-photo.entity';
import { EmpleadaFotosExclusivas } from './entities/employee-private-photo.entity';
import { Empleadas } from '../employees/entities/employee.entity';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmpleadaFotos,
      EmpleadaFotosExclusivas,
      Empleadas,
    ]),
    UploadModule,
  ],
  controllers: [EmployeePhotosController],
  providers: [EmployeePhotosService],
  exports: [EmployeePhotosService],
})
export class EmployeePhotosModule {}
