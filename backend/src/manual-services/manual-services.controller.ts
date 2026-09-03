import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ManualServicesService } from './manual-services.service';
import { CreateManualServiceRequestDto } from './dto/create-manual-service-request.dto';
import { ResolveManualServiceRequestDto } from './dto/resolve-manual-service-request.dto';

/**
 * Servicios que ocurrieron fuera del sistema.
 *
 * El camino normal es el chat --la empleada los registra desde Telegram y el
 * jefe los autoriza ahi mismo--, pero el panel necesita las mismas operaciones
 * para revisarlas con calma y para que quede una via cuando el chat falla.
 */
@ApiTags('manual-services')
@ApiBearerAuth('jwt')
@Controller('manual-services')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ManualServicesController {
  constructor(private readonly service: ManualServicesService) {}

  @Get()
  @Roles('admin', 'jefe', 'empleada')
  @ApiOperation({ summary: 'Listar solicitudes de registro manual' })
  findAll(@Query('estado') estado: string | undefined, @Req() req: any) {
    return this.service.listar(req.user, estado);
  }

  /**
   * Va antes de `:id` a proposito: con el orden inverso, Nest resolveria
   * `/opciones` contra la ruta con parametro y respondería un 400 por uuid.
   */
  @Get('opciones')
  @Roles('empleada')
  @ApiOperation({
    summary: 'Datos para autocompletar el formulario de la empleada',
  })
  options(@Req() req: any) {
    return this.service.opcionesParaEmpleada(req.user.id);
  }

  @Post()
  @Roles('empleada')
  @ApiOperation({
    summary:
      'Pedir que se registre un servicio ya ocurrido o uno recién cuadrado',
  })
  create(@Body() dto: CreateManualServiceRequestDto, @Req() req: any) {
    return this.service.crear(req.user.id, dto);
  }

  @Post(':id/aprobar')
  @Roles('admin', 'jefe')
  @ApiOperation({ summary: 'Autorizar el registro y crear el servicio' })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveManualServiceRequestDto,
    @Req() req: any,
  ) {
    return this.service.aprobar(id, req.user.id, dto.nota);
  }

  @Post(':id/rechazar')
  @Roles('admin', 'jefe')
  @ApiOperation({ summary: 'Rechazar el registro' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveManualServiceRequestDto,
    @Req() req: any,
  ) {
    return this.service.rechazar(id, req.user.id, dto.nota ?? '');
  }
}
