import {
  Controller,
  Sse,
  Query,
  UnauthorizedException,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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

type RealtimeTokenPayload = {
  sub: string;
  rol: 'jefe' | 'admin' | 'empleada' | 'chofer' | 'cliente';
  clienteId?: string;
};

@Controller('realtime')
@ApiControllerDocs('realtime')
export class RealtimeController {
  constructor(
    private readonly realtimeEventsService: RealtimeEventsService,
    private readonly jwtService: JwtService,
    @InjectRepository(Empleadas)
    private readonly empleadasRepository: Repository<Empleadas>,
    @InjectRepository(Choferes)
    private readonly choferesRepository: Repository<Choferes>,
  ) {}

  private verifyToken(token: string): RealtimeTokenPayload {
    try {
      return this.jwtService.verify<RealtimeTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }

  @Sse('sse/jefes')
  @UseGuards(JwtAuthGuard)
  @ApiSseTokenDocs('Conectar canal SSE para panel de jefes')
  sseJefes(@Req() request: { user: Usuarios }): Observable<any> {
    const user = request.user;
    if (user.rol !== 'jefe' && user.rol !== 'admin') {
      throw new UnauthorizedException('No tienes permisos para este panel');
    }
    return user.rol === 'admin'
      ? this.realtimeEventsService.getJefesStream()
      : this.realtimeEventsService.getBossStream(user.id);
  }

  @Sse('sse/empleada')
  @ApiSseTokenDocs('Conectar canal SSE para empleada autenticada')
  async sseEmpleada(@Query('token') token: string): Promise<Observable<any>> {
    const payload = this.verifyToken(token);
    if (payload.rol !== 'empleada') {
      throw new UnauthorizedException('Solo empleadas pueden conectar aquí');
    }
    const empleada = await this.empleadasRepository.findOne({
      where: { usuarioId: payload.sub },
    });
    if (!empleada) {
      throw new UnauthorizedException('Perfil de empleada no encontrado');
    }
    return this.realtimeEventsService.getEmployeeStream(empleada.id);
  }

  @Sse('sse/chofer')
  @ApiSseTokenDocs('Conectar canal SSE para chofer autenticado')
  async sseChofer(@Query('token') token: string): Promise<Observable<any>> {
    const payload = this.verifyToken(token);
    if (payload.rol !== 'chofer') {
      throw new UnauthorizedException('Solo choferes pueden conectar aquí');
    }
    const chofer = await this.choferesRepository.findOne({
      where: { usuarioId: payload.sub },
    });
    if (!chofer) {
      throw new UnauthorizedException('Perfil de chofer no encontrado');
    }
    return this.realtimeEventsService.getDriverStream(chofer.id);
  }

  @Sse('sse/cliente')
  @ApiSseTokenDocs('Conectar canal SSE para cliente autenticado')
  sseCliente(@Query('token') token: string): Observable<any> {
    const payload = this.verifyToken(token);
    if (payload.rol !== 'cliente' || !payload.clienteId) {
      throw new UnauthorizedException('Token de cliente inválido');
    }
    return this.realtimeEventsService.getClientStream(payload.clienteId);
  }
}
