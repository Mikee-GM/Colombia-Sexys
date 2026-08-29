import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ListClientsDto } from './dto/list-clients.dto';
import { BlockClientDto, UnblockClientDto } from './dto/block-client.dto';
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
  findAll(@Query() query: ListClientsDto) {
    return this.clientsService.findAll(query);
  }

  @Get(':id')
  @ApiFindOneDocs({ tag: 'clients', entity: Clientes, protected: true })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.findOne(id);
  }

  @Patch(':id')
  @ApiUpdateDocs({
    tag: 'clients',
    entity: Clientes,
    updateDto: UpdateClientDto,
    protected: true,
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateClientDto: UpdateClientDto,
  ) {
    return this.clientsService.update(id, updateClientDto);
  }

  @Get(':id/bloqueo')
  @ApiFindOneDocs({ tag: 'clients', entity: Clientes, protected: true })
  estadoDeBloqueo(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.estadoDeBloqueo(id);
  }

  /**
   * Bloquear a un cliente es cosa del jefe tanto como del admin: es quien esta
   * delante cuando pasa algo, y esperar a que un admin lo haga significa que el
   * cliente sigue escribiendo mientras tanto.
   */
  @Post(':id/bloqueo')
  bloquear(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BlockClientDto,
    @Req() req: any,
  ) {
    return this.clientsService.bloquear(id, req.user, dto);
  }

  @Delete(':id/bloqueo')
  desbloquear(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UnblockClientDto,
    @Req() req: any,
  ) {
    return this.clientsService.desbloquear(id, req.user, dto.reason);
  }

  @Delete(':id')
  @ApiRemoveDocs({ tag: 'clients', protected: true })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.clientsService.remove(id);
  }
}
