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
import { Usuarios } from '../users/entities/user.entity';

/**
 * Todos los canales se autentican con JwtAuthGuard, es decir por cookie firmada
 * o cabecera Authorization.
 *
 * Antes tres de ellos recibian el JWT como `?token=`: los query strings acaban
 * en los logs de acceso del proxy, en el historial del navegador y en la
 * cabecera Referer de cualquier recurso externo. Ademas se verificaban a mano
 * sin comprobar el tipo de token ni la sesion, asi que un token de portal de 7
 * dias abria el canal.
 *
 * Se elimino tambien `sse/cliente`: esperaba un rol 'cliente' que no existe en
 * la enumeracion de Usuarios y que ningun punto del backend emite, asi que era
 * inalcanzable.
 */
@Controller('realtime')
@ApiControllerDocs('realtime')
@UseGuards(JwtAuthGuard)
export class RealtimeController {
  constructor(
    private readonly realtimeEventsService: RealtimeEventsService,
    @InjectRepository(Empleadas)
    private readonly empleadasRepository: Repository<Empleadas>,
    @InjectRepository(Choferes)
    private readonly choferesRepository: Repository<Choferes>,
  ) {}

  @Sse('sse/jefes')
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
  @ApiSseTokenDocs('Conectar canal SSE para chofer autenticado')
  async sseChofer(
    @Req() request: { user: Usuarios },
  ): Promise<Observable<any>> {
    const user = request.user;
    if (user.rol !== 'chofer') {
      throw new ForbiddenException('Solo choferes pueden conectar aquí');
    }
    const chofer = await this.choferesRepository.findOne({
      where: { usuarioId: user.id },
      select: { id: true },
    });
    if (!chofer) {
      throw new NotFoundException('Perfil de chofer no encontrado');
    }
    return this.realtimeEventsService.getDriverStream(chofer.id);
  }
}
