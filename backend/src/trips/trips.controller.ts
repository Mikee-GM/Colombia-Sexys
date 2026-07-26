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
import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { Viajes } from './entities/trip.entity';
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

@Controller('trips')
@ApiControllerDocs('trips', true)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'jefe')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Post()
  @ApiCreateDocs({
    tag: 'trips',
    entity: Viajes,
    createDto: CreateTripDto,
    protected: true,
  })
  create(@Body() createTripDto: CreateTripDto) {
    return this.tripsService.create(createTripDto);
  }

  @Get()
  @ApiFindAllDocs({ tag: 'trips', entity: Viajes, protected: true })
  findAll() {
    return this.tripsService.findAll();
  }

  @Get(':id')
  @ApiFindOneDocs({ tag: 'trips', entity: Viajes, protected: true })
  findOne(@Param('id') id: string) {
    return this.tripsService.findOne(+id);
  }

  @Patch(':id')
  @ApiUpdateDocs({
    tag: 'trips',
    entity: Viajes,
    updateDto: UpdateTripDto,
    protected: true,
  })
  update(@Param('id') id: string, @Body() updateTripDto: UpdateTripDto) {
    return this.tripsService.update(+id, updateTripDto);
  }

  @Delete(':id')
  @ApiRemoveDocs({ tag: 'trips', protected: true })
  remove(@Param('id') id: string) {
    return this.tripsService.remove(+id);
  }
}
