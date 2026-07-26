import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { Empleadas } from './entities/employee.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  ApiControllerDocs,
  ApiCreateDocs,
  ApiFindAllDocs,
  ApiFindOneDocs,
  ApiRemoveDocs,
  ApiUpdateDocs,
} from '../common/swagger/api-docs.decorators';

@Controller('employees')
@ApiControllerDocs('employees', true)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'jefe')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @ApiCreateDocs({
    tag: 'employees',
    entity: Empleadas,
    createDto: CreateEmployeeDto,
    protected: true,
  })
  create(@Body() createEmployeeDto: CreateEmployeeDto) {
    return this.employeesService.create(createEmployeeDto);
  }

  @Get()
  @ApiFindAllDocs({ tag: 'employees', entity: Empleadas, protected: true })
  findAll() {
    return this.employeesService.findAll();
  }

  @Get(':id')
  @ApiFindOneDocs({ tag: 'employees', entity: Empleadas, protected: true })
  findOne(@Param('id') id: string) {
    return this.employeesService.findOne(id);
  }

  @Patch(':id')
  @ApiUpdateDocs({
    tag: 'employees',
    entity: Empleadas,
    updateDto: UpdateEmployeeDto,
    protected: true,
  })
  update(
    @Param('id') id: string,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
  ) {
    return this.employeesService.update(id, updateEmployeeDto);
  }

  @Delete(':id')
  @ApiRemoveDocs({ tag: 'employees', protected: true })
  remove(@Param('id') id: string) {
    return this.employeesService.remove(id);
  }
}
