import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { CatalogExtrasService } from './catalog-extras.service';
import { CreateCatalogExtraDto } from './dto/create-catalog-extra.dto';
import { UpdateCatalogExtraDto } from './dto/update-catalog-extra.dto';
import { ExtrasCatalogo } from './entities/catalog-extra.entity';
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

@Controller('catalog-extras')
@ApiControllerDocs('catalog-extras', true)
@UseGuards(JwtAuthGuard, RolesGuard)
export class CatalogExtrasController {
  constructor(private readonly catalogExtrasService: CatalogExtrasService) {}

  @Post()
  @ApiCreateDocs({
    tag: 'catalog-extras',
    entity: ExtrasCatalogo,
    createDto: CreateCatalogExtraDto,
    protected: true,
  })
  @Roles('admin', 'jefe')
  create(@Body() createCatalogExtraDto: CreateCatalogExtraDto) {
    return this.catalogExtrasService.create(createCatalogExtraDto);
  }

  @Get()
  @ApiFindAllDocs({
    tag: 'catalog-extras',
    entity: ExtrasCatalogo,
    protected: true,
  })
  @Roles('admin', 'jefe', 'empleada')
  findAll(@Query('empleadaId') empleadaId?: string) {
    if (empleadaId) {
      return this.catalogExtrasService.findByEmpleada(empleadaId);
    }
    return this.catalogExtrasService.findAll();
  }

  @Get(':id')
  @ApiFindOneDocs({
    tag: 'catalog-extras',
    entity: ExtrasCatalogo,
    protected: true,
  })
  @Roles('admin', 'jefe', 'empleada')
  findOne(@Param('id') id: string) {
    return this.catalogExtrasService.findOne(id);
  }

  @Patch(':id')
  @ApiUpdateDocs({
    tag: 'catalog-extras',
    entity: ExtrasCatalogo,
    updateDto: UpdateCatalogExtraDto,
    protected: true,
  })
  @Roles('admin', 'jefe')
  update(
    @Param('id') id: string,
    @Body() updateCatalogExtraDto: UpdateCatalogExtraDto,
  ) {
    return this.catalogExtrasService.update(id, updateCatalogExtraDto);
  }

  @Delete(':id')
  @ApiRemoveDocs({ tag: 'catalog-extras', protected: true })
  @Roles('admin', 'jefe')
  remove(@Param('id') id: string) {
    return this.catalogExtrasService.remove(id);
  }
}
