import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ApartmentsService } from './apartments.service';
import { CreateApartmentDto } from './dto/create-apartment.dto';
import { UpdateApartmentDto } from './dto/update-apartment.dto';
import { Apartments } from './entities/apartment.entity';
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

// Las direcciones operativas de los apartamentos son datos internos: el panel
// de administracion es su unico consumidor.
@Controller('apartments')
@ApiControllerDocs('apartments', true)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'jefe')
export class ApartmentsController {
  constructor(private readonly apartmentsService: ApartmentsService) {}

  @Post()
  @ApiCreateDocs({
    tag: 'apartments',
    entity: Apartments,
    createDto: CreateApartmentDto,
    protected: true,
  })
  create(@Body() createApartmentDto: CreateApartmentDto) {
    return this.apartmentsService.create(createApartmentDto);
  }

  @Get()
  @ApiFindAllDocs({ tag: 'apartments', entity: Apartments, protected: true })
  findAll() {
    return this.apartmentsService.findAll();
  }

  @Get(':id')
  @ApiFindOneDocs({ tag: 'apartments', entity: Apartments, protected: true })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.apartmentsService.findOne(id);
  }

  @Patch(':id')
  @ApiUpdateDocs({
    tag: 'apartments',
    entity: Apartments,
    updateDto: UpdateApartmentDto,
    protected: true,
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateApartmentDto: UpdateApartmentDto,
  ) {
    return this.apartmentsService.update(id, updateApartmentDto);
  }

  @Delete(':id')
  @ApiRemoveDocs({ tag: 'apartments', protected: true })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.apartmentsService.remove(id);
  }
}
