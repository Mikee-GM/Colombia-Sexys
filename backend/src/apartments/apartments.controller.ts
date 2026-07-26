import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ApartmentsService } from './apartments.service';
import { CreateApartmentDto } from './dto/create-apartment.dto';
import { UpdateApartmentDto } from './dto/update-apartment.dto';
import { Apartments } from './entities/apartment.entity';
import {
  ApiControllerDocs,
  ApiCreateDocs,
  ApiFindAllDocs,
  ApiFindOneDocs,
  ApiRemoveDocs,
  ApiUpdateDocs,
} from '../common/swagger/api-docs.decorators';

@Controller('apartments')
@ApiControllerDocs('apartments', false)
export class ApartmentsController {
  constructor(private readonly apartmentsService: ApartmentsService) {}

  @Post()
  @ApiCreateDocs({
    tag: 'apartments',
    entity: Apartments,
    createDto: CreateApartmentDto,
    protected: false,
  })
  create(@Body() createApartmentDto: CreateApartmentDto) {
    return this.apartmentsService.create(createApartmentDto);
  }

  @Get()
  @ApiFindAllDocs({ tag: 'apartments', entity: Apartments, protected: false })
  findAll() {
    return this.apartmentsService.findAll();
  }

  @Get(':id')
  @ApiFindOneDocs({ tag: 'apartments', entity: Apartments, protected: false })
  findOne(@Param('id') id: string) {
    return this.apartmentsService.findOne(id);
  }

  @Patch(':id')
  @ApiUpdateDocs({
    tag: 'apartments',
    entity: Apartments,
    updateDto: UpdateApartmentDto,
    protected: false,
  })
  update(
    @Param('id') id: string,
    @Body() updateApartmentDto: UpdateApartmentDto,
  ) {
    return this.apartmentsService.update(id, updateApartmentDto);
  }

  @Delete(':id')
  @ApiRemoveDocs({ tag: 'apartments', protected: false })
  remove(@Param('id') id: string) {
    return this.apartmentsService.remove(id);
  }
}
