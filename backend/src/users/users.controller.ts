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
  Req,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { WorkShiftStatusDto } from './dto/work-shift-status.dto';
import { WorkShiftStatusService } from './work-shift-status.service';
import { Usuarios } from './entities/user.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import {
  ApiActionDocs,
  ApiControllerDocs,
  ApiCreateDocs,
  ApiFindAllDocs,
  ApiFindOneDocs,
  ApiRemoveDocs,
  ApiUpdateDocs,
} from '../common/swagger/api-docs.decorators';

@Controller('users')
@ApiControllerDocs('users', true)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly workShiftStatus: WorkShiftStatusService,
  ) {}

  @Post()
  @ApiCreateDocs({
    tag: 'users',
    entity: Usuarios,
    createDto: CreateUserDto,
    protected: true,
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'jefe')
  create(@Body() createUserDto: CreateUserDto, @GetUser() actor: Usuarios) {
    return this.usersService.create(createUserDto, actor);
  }

  @Get()
  @ApiFindAllDocs({ tag: 'users', entity: Usuarios, protected: true })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'jefe')
  findAll(@Query('rol') rol?: Usuarios['rol']) {
    return this.usersService.findAll(rol);
  }

  /**
   * Estado de jornada de quien pregunta. Sin `:id`: cada quien consulta y
   * cambia el suyo, y no hace falta que el panel sepa su propio id.
   */
  @Get('me/jornada')
  @UseGuards(JwtAuthGuard)
  getMyWorkShift(@Req() req: any) {
    return this.workShiftStatus.getStatus(req.user.id);
  }

  /**
   * Cierra o reabre la jornada. Cualquier rol puede cambiar el suyo; lo que
   * cambia segun el rol es a quien se avisa.
   */
  @Patch('me/jornada')
  @UseGuards(JwtAuthGuard)
  setMyWorkShift(@Body() dto: WorkShiftStatusDto, @Req() req: any) {
    return this.workShiftStatus.setStatus(req.user, dto.enJornada);
  }

  /** Personal fuera de jornada, para el panel de admin. */
  @Get('off-duty')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'jefe')
  listOffDuty() {
    return this.workShiftStatus.listOffDuty();
  }

  @Get(':id')
  @ApiFindOneDocs({ tag: 'users', entity: Usuarios, protected: true })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'jefe')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ApiUpdateDocs({
    tag: 'users',
    entity: Usuarios,
    updateDto: UpdateUserDto,
    protected: true,
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'jefe')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @ApiRemoveDocs({ tag: 'users', protected: true })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @Post(':id/telegram-otp')
  @ApiActionDocs(
    'Generar codigo OTP para vincular Telegram',
    true,
    'ID del usuario',
  )
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'jefe')
  generateTelegramOtp(@Param('id') id: string) {
    return this.usersService.generateTelegramOtp(id);
  }

  @Post(':id/unlink-telegram')
  @ApiActionDocs(
    'Desvincular cuenta de Telegram del usuario',
    true,
    'ID del usuario',
  )
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'jefe')
  unlinkTelegram(@Param('id') id: string) {
    return this.usersService.unlinkTelegram(id);
  }
}
