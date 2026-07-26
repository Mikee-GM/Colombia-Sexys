import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ServiceExtensionsService } from './service-extensions.service';
import { CreateServiceExtensionDto } from './dto/create-service-extension.dto';
import { UpdateServiceExtensionDto } from './dto/update-service-extension.dto';
import { ExtensionesServicio } from './entities/service-extension.entity';
import {
  ApiControllerDocs,
  ApiCreateDocs,
  ApiFindAllDocs,
  ApiFindOneDocs,
  ApiRemoveDocs,
  ApiUpdateDocs,
} from '../common/swagger/api-docs.decorators';

@Controller('service-extensions')
@ApiControllerDocs('service-extensions', false)
export class ServiceExtensionsController {
  constructor(
    private readonly serviceExtensionsService: ServiceExtensionsService,
  ) {}

  @Post()
  @ApiCreateDocs({
    tag: 'service-extensions',
    entity: ExtensionesServicio,
    createDto: CreateServiceExtensionDto,
    protected: false,
  })
  create(@Body() createServiceExtensionDto: CreateServiceExtensionDto) {
    return this.serviceExtensionsService.create(createServiceExtensionDto);
  }

  @Get()
  @ApiFindAllDocs({
    tag: 'service-extensions',
    entity: ExtensionesServicio,
    protected: false,
  })
  findAll() {
    return this.serviceExtensionsService.findAll();
  }

  @Get(':id')
  @ApiFindOneDocs({
    tag: 'service-extensions',
    entity: ExtensionesServicio,
    protected: false,
  })
  findOne(@Param('id') id: string) {
    return this.serviceExtensionsService.findOne(+id);
  }

  @Patch(':id')
  @ApiUpdateDocs({
    tag: 'service-extensions',
    entity: ExtensionesServicio,
    updateDto: UpdateServiceExtensionDto,
    protected: false,
  })
  update(
    @Param('id') id: string,
    @Body() updateServiceExtensionDto: UpdateServiceExtensionDto,
  ) {
    return this.serviceExtensionsService.update(+id, updateServiceExtensionDto);
  }

  @Delete(':id')
  @ApiRemoveDocs({ tag: 'service-extensions', protected: false })
  remove(@Param('id') id: string) {
    return this.serviceExtensionsService.remove(+id);
  }
}
