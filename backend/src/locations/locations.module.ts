import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Choferes } from '../drivers/entities/driver.entity';
import { Empleadas } from '../employees/entities/employee.entity';
import { LocationsService } from './locations.service';

/**
 * No tiene controller propio a proposito: quien recibe la posicion es el portal
 * de cada rol, que ya sabe quien esta al otro lado. Un endpoint suelto tendria
 * que volver a resolver esa identidad, y seria un tercer sitio donde
 * equivocarse.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Choferes, Empleadas])],
  providers: [LocationsService],
  exports: [LocationsService],
})
export class LocationsModule {}
