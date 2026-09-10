import {
  Controller,
  ForbiddenException,
  NotFoundException,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable } from 'rxjs';
import { RealtimeEventsService } from './realtime.service';
import { Empleadas } from '../employees/entities/employee.entity';
import { Choferes } from '../drivers/entities/driver.entity';
import {
  ApiControllerDocs,
  ApiSseTokenDocs,
} from '../common/swagger/api-docs.decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PortalAuthGuard } from '../auth/guards/portal-auth.guard';
import { PortalUser } from '../auth/decorators/portal-user.decorator';
import { Usuarios } from '../users/entities/user.entity';

/**
 * Jefes y empleadas se autentican con JwtAuthGuard: cookie firmada de sesion
 * completa o cabecera Authorization.
 *
 * Antes tres canales recibian el JWT como `?token=`: los query strings acaban
 * en los logs de acceso del proxy, en el historial del navegador y en la
 * cabecera Referer de cualquier recurso externo. Ademas se verificaban a mano
 * sin comprobar el tipo de token ni la sesion, asi que un token de portal de 7
 * dias abria el canal.
 *
 * `sse/chofer` es distinto a proposito: el portal de chofer es una Mini App de
 * Telegram que nunca llega a tener esa sesion completa (ver PortalAuthGuard),
 * asi que usa el mismo guard que ya protege el resto del portal
 * (DriverPortalController) en vez de JwtAuthGuard. Ese guard si sabe aceptar
 * el token por query de forma segura, verificando tipo y firma.
 *
 * Se elimino tambien `sse/cliente`: esperaba un rol 'cliente' que no existe en
 * la enumeracion de Usuarios y que ningun punto del backend emite, asi que era
 * inalcanzable.
 */
@Controller('realtime')
@ApiControllerDocs('realtime')
export class RealtimeController {
  constructor(
    private readonly realtimeEventsService: RealtimeEventsService,
    @InjectRepository(Empleadas)
    private readonly empleadasRepository: Repository<Empleadas>,
    @InjectRepository(Choferes)
    private readonly choferesRepository: Repository<Choferes>,
  ) {}

  @Sse('sse/jefes')
  @UseGuards(JwtAuthGuard)
  @ApiSseTokenDocs('Conectar canal SSE para panel de jefes')
  sseJefes(@Req() request: { user: Usuarios }): Observable<any> {
    const user = request.user;
    if (user.rol !== 'jefe' && user.rol !== 'admin') {
      throw new ForbiddenException('No tienes permisos para este panel');
    }
    return user.rol === 'admin'
      ? this.realtimeEventsService.getJefesStream()
      : this.realtimeEventsService.getBossStream(user.id);
  }

  @Sse('sse/empleada')
  @UseGuards(JwtAuthGuard)
  @ApiSseTokenDocs('Conectar canal SSE para empleada autenticada')
  async sseEmpleada(
    @Req() request: { user: Usuarios },
  ): Promise<Observable<any>> {
    const user = request.user;
    if (user.rol !== 'empleada') {
      throw new ForbiddenException('Solo empleadas pueden conectar aquí');
    }
    const empleada = await this.empleadasRepository.findOne({
      where: { usuarioId: user.id },
      select: { id: true },
    });
    if (!empleada) {
      throw new NotFoundException('Perfil de empleada no encontrado');
    }
    return this.realtimeEventsService.getEmployeeStream(empleada.id);
  }

  @Sse('sse/chofer')
  @UseGuards(PortalAuthGuard)
  @ApiSseTokenDocs('Conectar canal SSE para chofer autenticado')
  async sseChofer(@PortalUser() userId: string): Promise<Observable<any>> {
    const chofer = await this.choferesRepository.findOne({
      where: { usuarioId: userId },
      select: { id: true },
    });
    if (!chofer) {
      throw new NotFoundException('Perfil de chofer no encontrado');
    }
    return this.realtimeEventsService.getDriverStream(chofer.id);
  }
}
