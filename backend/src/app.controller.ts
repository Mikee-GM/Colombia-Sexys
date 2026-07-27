import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { AppService } from './app.service';
import { EmployeesService } from './employees/employees.service';

@Controller()
@ApiTags('health')
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly employeesService: EmployeesService,
    private readonly dataSource: DataSource,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Obtener mensaje de estado de la API' })
  @ApiOkResponse({ description: 'Mensaje de estado', type: String })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health/live')
  @ApiOperation({ summary: 'Comprobar que el proceso de la API responde' })
  healthLive() {
    return { status: 'ok' as const };
  }

  @Get('health/ready')
  @ApiOperation({ summary: 'Comprobar que la API y PostgreSQL estan listos' })
  async healthReady() {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok' as const, database: 'available' as const };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'unavailable',
      });
    }
  }

  @Get('catalog/employees')
  async getCatalogEmployees() {
    return this.employeesService.findAllActive();
  }
}
