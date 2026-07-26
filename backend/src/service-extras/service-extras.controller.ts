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
import { ServiceExtrasService } from './service-extras.service';
import { CreateServiceExtraDto } from './dto/create-service-extra.dto';
import { UpdateServiceExtraDto } from './dto/update-service-extra.dto';
import { ExtrasServicio } from './entities/service-extra.entity';
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

@Controller('service-extras')
@ApiControllerDocs('service-extras', true)
@UseGuards(JwtAuthGuard, RolesGuard)
export class ServiceExtrasController {
  constructor(private readonly serviceExtrasService: ServiceExtrasService) {}

  @Post()
  @ApiCreateDocs({
    tag: 'service-extras',
    entity: ExtrasServicio,
    createDto: CreateServiceExtraDto,
    protected: true,
  })
  @Roles('admin', 'jefe', 'empleada')
  create(@Body() createServiceExtraDto: CreateServiceExtraDto) {
    return this.serviceExtrasService.create(createServiceExtraDto);
  }

  @Get()
  @ApiFindAllDocs({
    tag: 'service-extras',
    entity: ExtrasServicio,
    protected: true,
  })
  @Roles('admin', 'jefe')
  findAll() {
    return this.serviceExtrasService.findAll();
  }

  @Get(':id')
  @ApiFindOneDocs({
    tag: 'service-extras',
    entity: ExtrasServicio,
    protected: true,
  })
  @Roles('admin', 'jefe')
  findOne(@Param('id') id: string) {
    return this.serviceExtrasService.findOne(+id);
  }

  @Patch(':id')
  @ApiUpdateDocs({
    tag: 'service-extras',
    entity: ExtrasServicio,
    updateDto: UpdateServiceExtraDto,
    protected: true,
  })
  @Roles('admin', 'jefe')
  update(
    @Param('id') id: string,
    @Body() updateServiceExtraDto: UpdateServiceExtraDto,
  ) {
    return this.serviceExtrasService.update(+id, updateServiceExtraDto);
  }

  @Delete(':id')
  @ApiRemoveDocs({ tag: 'service-extras', protected: true })
  @Roles('admin', 'jefe')
  remove(@Param('id') id: string) {
    return this.serviceExtrasService.remove(+id);
  }
}
