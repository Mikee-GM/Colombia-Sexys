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
import { DriversService } from './drivers.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { Choferes } from './entities/driver.entity';
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

@Controller('drivers')
@ApiControllerDocs('drivers', true)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'jefe')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Post()
  @ApiCreateDocs({
    tag: 'drivers',
    entity: Choferes,
    createDto: CreateDriverDto,
    protected: true,
  })
  create(@Body() createDriverDto: CreateDriverDto) {
    return this.driversService.create(createDriverDto);
  }

  @Get()
  @ApiFindAllDocs({ tag: 'drivers', entity: Choferes, protected: true })
  findAll() {
    return this.driversService.findAll();
  }

  @Get(':id')
  @ApiFindOneDocs({ tag: 'drivers', entity: Choferes, protected: true })
  findOne(@Param('id') id: string) {
    return this.driversService.findOne(id);
  }

  @Patch(':id')
  @ApiUpdateDocs({
    tag: 'drivers',
    entity: Choferes,
    updateDto: UpdateDriverDto,
    protected: true,
  })
  update(@Param('id') id: string, @Body() updateDriverDto: UpdateDriverDto) {
    return this.driversService.update(id, updateDriverDto);
  }

  @Delete(':id')
  @ApiRemoveDocs({ tag: 'drivers', protected: true })
  remove(@Param('id') id: string) {
    return this.driversService.remove(id);
  }
}
