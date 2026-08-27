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
  Query,
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
  CancelledTripCostDto,
  UberStatusDto,
} from './dto/transport-action.dto';
import { CancelServiceDto } from './dto/cancel-service.dto';
import {
  ApiActionDocs,
  ApiControllerDocs,
  ApiCreateDocs,
  ApiFindAllDocs,
  ApiFindOneDocs,
  ApiRemoveDocs,
  ApiUpdateDocs,
} from '../common/swagger/api-docs.decorators';
import { SaveBankAccountDto } from './dto/bank-account.dto';

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

  @Get('bank-accounts')
  @Roles('admin')
  bankAccounts() {
    return this.servicesService.findBankAccounts();
  }

  @Post('bank-accounts')
  @Roles('admin')
  createBankAccount(@Body() dto: SaveBankAccountDto) {
    return this.servicesService.createBankAccount(dto);
  }

  @Patch('bank-accounts/:accountId')
  @Roles('admin')
  updateBankAccount(
    @Param('accountId') accountId: string,
    @Body() dto: SaveBankAccountDto,
  ) {
    return this.servicesService.updateBankAccount(accountId, dto);
  }

  @Delete('bank-accounts/:accountId')
  @Roles('admin')
  deleteBankAccount(@Param('accountId') accountId: string) {
    return this.servicesService.removeBankAccount(accountId);
  }

  @Get()
  @ApiFindAllDocs({ tag: 'services', entity: Servicios, protected: true })
  findAll(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.servicesService.findAll(req.user, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  /**
   * Evidencias almacenadas: comprobantes de transferencia y capturas de Uber.
   *
   * Los filtros por empleada y por fechas los usa el corte semanal, que
   * necesita solo las transferencias de esa empleada dentro del periodo.
   */
  @Get('evidence')
  findEvidence(
    @Req() req: any,
    @Query('kind') kind?: string,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
    @Query('employeeId') employeeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.servicesService.findEvidence(req.user, {
      kind,
      status,
      cursor,
      limit,
      employeeId,
      from,
      to,
    });
  }

  @Get(':id')
  @ApiFindOneDocs({ tag: 'services', entity: Servicios, protected: true })
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.servicesService.findOneForActor(id, req.user);
  }

  @Patch(':id')
  @Roles('admin', 'jefe')
  @ApiUpdateDocs({
    tag: 'services',
    entity: Servicios,
    updateDto: UpdateServiceDto,
    protected: true,
  })
  update(
    @Param('id') id: string,
    @Body() updateServiceDto: UpdateServiceDto,
    @Req() req: any,
  ) {
    return this.servicesService.updateForActor(id, updateServiceDto, req.user);
  }

  @Delete(':id')
  @ApiRemoveDocs({ tag: 'services', protected: true })
  remove(@Param('id') id: string) {
    return this.servicesService.remove(id);
  }

  @Post(':id/cancel')
  @ApiActionDocs('Cancelar un servicio', true, 'ID del servicio')
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelServiceDto,
    @Req() req: any,
  ) {
    return this.servicesService.cancel(id, req.user, dto);
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

  // Bandeja del dinero de transporte que se gasto en servicios cancelados y
  // todavia no entra a ningun corte.
  @Get('trips/pending-cancellation-cost')
  pendingCancellationCosts(@Req() req: any) {
    return this.servicesService.listPendingCancellationCosts(req.user);
  }

  // Cierre del Uber que quedo pendiente al cancelar el servicio: la tarifa real
  // o un cero si el viaje nunca salio.
  @Post('trips/:tripId/cancellation-cost')
  @ApiActionDocs(
    'Cerrar el costo de un viaje cancelado',
    true,
    'ID del viaje',
    'tripId',
  )
  settleCancelledTripCost(
    @Param('tripId') tripId: string,
    @Body() dto: CancelledTripCostDto,
    @Req() req: any,
  ) {
    return this.servicesService.settleCancelledTripCost(
      tripId,
      req.user.id,
      dto.amount,
      dto.chargeToClient ?? false,
    );
  }

  // Completar o corregir el motivo de una cancelacion ya registrada.
  @Patch(':id/cancellation')
  @ApiActionDocs(
    'Corregir el motivo de una cancelación',
    true,
    'ID del servicio',
  )
  updateCancellation(
    @Param('id') id: string,
    @Body() dto: CancelServiceDto,
    @Req() req: any,
  ) {
    return this.servicesService.updateCancellationDetails(id, req.user, dto);
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
