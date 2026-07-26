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
import { ExtensionsService } from './extensions.service';
import { CreateExtensionDto } from './dto/create-extension.dto';
import { UpdateExtensionDto } from './dto/update-extension.dto';
import { Prorrogas } from './entities/extension.entity';
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

@Controller('extensions')
@ApiControllerDocs('extensions', true)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'jefe')
export class ExtensionsController {
  constructor(private readonly extensionsService: ExtensionsService) {}

  @Post()
  @ApiCreateDocs({
    tag: 'extensions',
    entity: Prorrogas,
    createDto: CreateExtensionDto,
    protected: true,
  })
  create(@Body() createExtensionDto: CreateExtensionDto) {
    return this.extensionsService.create(createExtensionDto);
  }

  @Get()
  @ApiFindAllDocs({ tag: 'extensions', entity: Prorrogas, protected: true })
  findAll() {
    return this.extensionsService.findAll();
  }

  @Get(':id')
  @ApiFindOneDocs({ tag: 'extensions', entity: Prorrogas, protected: true })
  findOne(@Param('id') id: string) {
    return this.extensionsService.findOne(+id);
  }

  @Patch(':id')
  @ApiUpdateDocs({
    tag: 'extensions',
    entity: Prorrogas,
    updateDto: UpdateExtensionDto,
    protected: true,
  })
  update(
    @Param('id') id: string,
    @Body() updateExtensionDto: UpdateExtensionDto,
  ) {
    return this.extensionsService.update(+id, updateExtensionDto);
  }

  @Delete(':id')
  @ApiRemoveDocs({ tag: 'extensions', protected: true })
  remove(@Param('id') id: string) {
    return this.extensionsService.remove(+id);
  }
}
