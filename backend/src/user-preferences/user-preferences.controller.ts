import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { UserPreferencesService } from './user-preferences.service';
import { UpdatePreferenceDto } from './dto/update-preference.dto';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Usuarios } from '../users/entities/user.entity';
import { ApiControllerDocs } from '../common/swagger/api-docs.decorators';

/**
 * Ajustes de pantalla del usuario que hace la peticion.
 *
 * No hay rutas por id ajeno a proposito: el sujeto es siempre quien trae la
 * sesion, asi que no hay forma de leer ni de pisar la configuracion de otro.
 * Por eso tampoco lleva `@Roles`: cualquier rol con sesion puede guardar los
 * suyos.
 */
@Controller('user-preferences')
@ApiControllerDocs('user-preferences', true)
@UseGuards(JwtAuthGuard)
export class UserPreferencesController {
  constructor(private readonly service: UserPreferencesService) {}

  @Get(':key')
  get(@Param('key') key: string, @GetUser() actor: Usuarios) {
    return this.service.get(actor.id, key);
  }

  @Put(':key')
  set(
    @Param('key') key: string,
    @Body() dto: UpdatePreferenceDto,
    @GetUser() actor: Usuarios,
  ) {
    return this.service.set(actor.id, key, dto.value);
  }

  @Delete(':key')
  @HttpCode(204)
  reset(@Param('key') key: string, @GetUser() actor: Usuarios) {
    return this.service.reset(actor.id, key);
  }
}
