import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { EmployeesService } from './employees/employees.service';

@Controller()
@ApiTags('health')
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly employeesService: EmployeesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Obtener mensaje de estado de la API' })
  @ApiOkResponse({ description: 'Mensaje de estado', type: String })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('catalog/employees')
  async getCatalogEmployees() {
    return this.employeesService.findAllActive();
  }
}
