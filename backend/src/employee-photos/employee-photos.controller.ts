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
import { EmployeePhotosService } from './employee-photos.service';
import { CreateEmployeePhotoDto } from './dto/create-employee-photo.dto';
import { UpdateEmployeePhotoDto } from './dto/update-employee-photo.dto';
import { EmpleadaFotos } from './entities/employee-photo.entity';
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

@Controller('employee-photos')
@ApiControllerDocs('employee-photos', true)
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmployeePhotosController {
  constructor(private readonly employeePhotosService: EmployeePhotosService) {}

  @Post()
  @ApiCreateDocs({
    tag: 'employee-photos',
    entity: EmpleadaFotos,
    createDto: CreateEmployeePhotoDto,
    protected: true,
  })
  @Roles('admin', 'jefe')
  create(@Body() createEmployeePhotoDto: CreateEmployeePhotoDto) {
    return this.employeePhotosService.create(createEmployeePhotoDto);
  }

  @Get()
  @ApiFindAllDocs({
    tag: 'employee-photos',
    entity: EmpleadaFotos,
    protected: true,
  })
  @Roles('admin', 'jefe', 'empleada')
  findAll() {
    return this.employeePhotosService.findAll();
  }

  @Get(':id')
  @ApiFindOneDocs({
    tag: 'employee-photos',
    entity: EmpleadaFotos,
    protected: true,
  })
  @Roles('admin', 'jefe', 'empleada')
  findOne(@Param('id') id: string) {
    return this.employeePhotosService.findOne(id);
  }

  @Patch(':id')
  @ApiUpdateDocs({
    tag: 'employee-photos',
    entity: EmpleadaFotos,
    updateDto: UpdateEmployeePhotoDto,
    protected: true,
  })
  @Roles('admin', 'jefe')
  update(
    @Param('id') id: string,
    @Body() updateEmployeePhotoDto: UpdateEmployeePhotoDto,
  ) {
    return this.employeePhotosService.update(id, updateEmployeePhotoDto);
  }

  @Delete(':id')
  @ApiRemoveDocs({ tag: 'employee-photos', protected: true })
  @Roles('admin', 'jefe')
  remove(@Param('id') id: string) {
    return this.employeePhotosService.remove(id);
  }

  // --- ENDPOINTS FOTOS EXCLUSIVAS ---

  @Get('private/:empleadaId')
  @Roles('admin', 'jefe')
  findPrivateByEmployee(@Param('empleadaId') empleadaId: string) {
    return this.employeePhotosService.findPrivatePhotosByEmployee(empleadaId);
  }

  @Post('private')
  @Roles('admin', 'jefe')
  createPrivate(
    @Body() body: { empleadaId: string; url: string; orden?: number },
  ) {
    return this.employeePhotosService.createPrivatePhoto(
      body.empleadaId,
      body.url,
      body.orden ?? 0,
    );
  }

  @Delete('private/:id')
  @Roles('admin', 'jefe')
  removePrivate(@Param('id') id: string) {
    return this.employeePhotosService.removePrivatePhoto(id);
  }
}
