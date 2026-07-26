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
import { ClientAlertsService } from './client-alerts.service';
import { CreateClientAlertDto } from './dto/create-client-alert.dto';
import { UpdateClientAlertDto } from './dto/update-client-alert.dto';
import { AlertasClientes } from './entities/client-alert.entity';
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

@Controller('client-alerts')
@ApiControllerDocs('client-alerts', true)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'jefe')
export class ClientAlertsController {
  constructor(private readonly clientAlertsService: ClientAlertsService) {}

  @Post()
  @ApiCreateDocs({
    tag: 'client-alerts',
    entity: AlertasClientes,
    createDto: CreateClientAlertDto,
    protected: true,
  })
  create(@Body() createClientAlertDto: CreateClientAlertDto) {
    return this.clientAlertsService.create(createClientAlertDto);
  }

  @Get()
  @ApiFindAllDocs({
    tag: 'client-alerts',
    entity: AlertasClientes,
    protected: true,
  })
  findAll() {
    return this.clientAlertsService.findAll();
  }

  @Get(':id')
  @ApiFindOneDocs({
    tag: 'client-alerts',
    entity: AlertasClientes,
    protected: true,
  })
  findOne(@Param('id') id: string) {
    return this.clientAlertsService.findOne(+id);
  }

  @Patch(':id')
  @ApiUpdateDocs({
    tag: 'client-alerts',
    entity: AlertasClientes,
    updateDto: UpdateClientAlertDto,
    protected: true,
  })
  update(
    @Param('id') id: string,
    @Body() updateClientAlertDto: UpdateClientAlertDto,
  ) {
    return this.clientAlertsService.update(+id, updateClientAlertDto);
  }

  @Delete(':id')
  @ApiRemoveDocs({ tag: 'client-alerts', protected: true })
  remove(@Param('id') id: string) {
    return this.clientAlertsService.remove(+id);
  }
}
