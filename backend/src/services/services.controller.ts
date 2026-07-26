import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { Servicios } from './entities/service.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  SelectTransportDto,
  UberFareDto,
  UberStatusDto,
} from './dto/transport-action.dto';
import {
  ApiActionDocs,
  ApiControllerDocs,
  ApiCreateDocs,
  ApiFindAllDocs,
  ApiFindOneDocs,
  ApiRemoveDocs,
  ApiUpdateDocs,
} from '../common/swagger/api-docs.decorators';

@Controller('services')
@ApiControllerDocs('services', true)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'jefe')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Post()
  @ApiCreateDocs({
    tag: 'services',
    entity: Servicios,
    createDto: CreateServiceDto,
    protected: true,
  })
  create(@Body() createServiceDto: CreateServiceDto) {
    return this.servicesService.create(createServiceDto);
  }

  @Get('pendientes')
  @ApiFindAllDocs({
    tag: 'services pendientes',
    entity: Servicios,
    protected: true,
  })
  getPending(@Req() req: any) {
    return this.servicesService.getPending(req.user);
  }

  @Get()
  @ApiFindAllDocs({ tag: 'services', entity: Servicios, protected: true })
  findAll(@Req() req: any) {
    return this.servicesService.findAll(req.user);
  }

  @Get(':id')
  @ApiFindOneDocs({ tag: 'services', entity: Servicios, protected: true })
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.servicesService.findOneForActor(id, req.user);
  }

  @Patch(':id')
  @Roles('admin')
  @ApiUpdateDocs({
    tag: 'services',
    entity: Servicios,
    updateDto: UpdateServiceDto,
    protected: true,
  })
  update(@Param('id') id: string, @Body() updateServiceDto: UpdateServiceDto) {
    return this.servicesService.update(id, updateServiceDto);
  }

  @Delete(':id')
  @ApiRemoveDocs({ tag: 'services', protected: true })
  remove(@Param('id') id: string) {
    return this.servicesService.remove(id);
  }

  @Post(':id/aceptar')
  @ApiActionDocs('Aceptar un servicio pendiente', true, 'ID del servicio')
  aceptar(
    @Param('id') id: string,
    @Body() dto: SelectTransportDto,
    @Req() req: any,
  ) {
    const jefeId = req.user.id;
    return this.servicesService.aceptar(
      id,
      jefeId,
      dto.transportType,
      dto.bossNotes,
    );
  }

  @Post(':id/rechazar')
  @ApiActionDocs('Rechazar un servicio pendiente', true, 'ID del servicio')
  rechazar(@Param('id') id: string, @Req() req: any) {
    const jefeId = req.user.id;
    return this.servicesService.rechazar(id, jefeId);
  }

  @Post(':id/return-transport')
  chooseReturnTransport(
    @Param('id') id: string,
    @Body() dto: SelectTransportDto,
    @Req() req: any,
  ) {
    return this.servicesService.chooseReturnTransport(
      id,
      req.user.id,
      dto.transportType === 'chofer' ? 'interno' : 'uber',
    );
  }

  @Post('trips/:tripId/uber-screenshot')
  @UseInterceptors(FileInterceptor('file'))
  uploadUberScreenshot(
    @Param('tripId') tripId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /^image\// }),
        ],
      }),
    )
    file: any,
    @Req() req: any,
  ) {
    return this.servicesService.saveUberScreenshotFromDashboard(
      tripId,
      req.user.id,
      file,
    );
  }

  @Post('trips/:tripId/uber-fare')
  confirmUberFare(
    @Param('tripId') tripId: string,
    @Body() dto: UberFareDto,
    @Req() req: any,
  ) {
    return this.servicesService.confirmUberFare(
      tripId,
      req.user.id,
      dto.amount,
    );
  }

  @Patch('trips/:tripId/transport')
  changeTripTransport(
    @Param('tripId') tripId: string,
    @Body() dto: SelectTransportDto,
    @Req() req: any,
  ) {
    return this.servicesService.changeTripTransport(
      tripId,
      req.user.id,
      dto.transportType === 'chofer' ? 'interno' : 'uber',
    );
  }

  @Patch('trips/:tripId/uber-status')
  updateUberStatus(
    @Param('tripId') tripId: string,
    @Body() dto: UberStatusDto,
    @Req() req: any,
  ) {
    return this.servicesService.updateUberStatus(
      tripId,
      req.user.id,
      dto.status === 'llegado' ? 'uber_arrived' : 'uber_en_route',
    );
  }
}
