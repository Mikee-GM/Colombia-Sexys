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
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { Clientes } from './entities/client.entity';
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

@Controller('clients')
@ApiControllerDocs('clients', true)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'jefe')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @ApiCreateDocs({
    tag: 'clients',
    entity: Clientes,
    createDto: CreateClientDto,
    protected: true,
  })
  create(@Body() createClientDto: CreateClientDto) {
    return this.clientsService.create(createClientDto);
  }

  @Get()
  @ApiFindAllDocs({ tag: 'clients', entity: Clientes, protected: true })
  findAll() {
    return this.clientsService.findAll();
  }

  @Get(':id')
  @ApiFindOneDocs({ tag: 'clients', entity: Clientes, protected: true })
  findOne(@Param('id') id: string) {
    return this.clientsService.findOne(+id);
  }

  @Patch(':id')
  @ApiUpdateDocs({
    tag: 'clients',
    entity: Clientes,
    updateDto: UpdateClientDto,
    protected: true,
  })
  update(@Param('id') id: string, @Body() updateClientDto: UpdateClientDto) {
    return this.clientsService.update(+id, updateClientDto);
  }

  @Delete(':id')
  @ApiRemoveDocs({ tag: 'clients', protected: true })
  remove(@Param('id') id: string) {
    return this.clientsService.remove(+id);
  }
}
