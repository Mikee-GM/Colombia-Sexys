import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { TeamChannelService } from './team-channel.service';
import { EnviarMensajeEquipoDto } from './dto/team-channel.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Usuarios } from '../users/entities/user.entity';
import { ApiControllerDocs } from '../common/swagger/api-docs.decorators';

/**
 * Lado del jefe del canal con sus modelos.
 *
 * El lado de ella no esta aqui sino en `employee-portal`, porque entra con el
 * pase del portal y no con la sesion del panel. Son dos puertas distintas a la
 * misma conversacion.
 */
@Controller('team-channel')
@ApiControllerDocs('team-channel', true)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('jefe', 'admin')
export class TeamChannelController {
  constructor(private readonly teamChannel: TeamChannelService) {}

  @Get('unread')
  @ApiOperation({ summary: 'Mensajes sin leer por modelo' })
  unread(@GetUser() actor: Usuarios) {
    return this.teamChannel.sinLeerParaJefe(actor);
  }

  @Get(':empleadaId')
  @ApiOperation({ summary: 'Conversación con una modelo' })
  list(
    @GetUser() actor: Usuarios,
    @Param('empleadaId', new ParseUUIDPipe()) empleadaId: string,
  ) {
    return this.teamChannel.listarParaJefe(actor, empleadaId);
  }

  @Post(':empleadaId')
  @HttpCode(201)
  @ApiOperation({ summary: 'Escribir a una modelo' })
  send(
    @GetUser() actor: Usuarios,
    @Param('empleadaId', new ParseUUIDPipe()) empleadaId: string,
    @Body() dto: EnviarMensajeEquipoDto,
  ) {
    return this.teamChannel.enviarDesdeJefe(
      actor,
      empleadaId,
      dto.cuerpo,
      dto.tipo,
    );
  }

  @Post(':empleadaId/preguntar-jornada')
  @HttpCode(201)
  @ApiOperation({ summary: 'Preguntarle por qué cerró su jornada' })
  askWorkShiftReason(
    @GetUser() actor: Usuarios,
    @Param('empleadaId', new ParseUUIDPipe()) empleadaId: string,
  ) {
    return this.teamChannel.preguntarMotivoDeJornada(actor, empleadaId);
  }
}
