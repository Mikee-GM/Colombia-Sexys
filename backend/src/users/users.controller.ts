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
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Usuarios } from './entities/user.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
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
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiCreateDocs({
    tag: 'users',
    entity: Usuarios,
    createDto: CreateUserDto,
    protected: false,
  })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @ApiFindAllDocs({ tag: 'users', entity: Usuarios, protected: true })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'jefe')
  findAll(@Query('rol') rol?: Usuarios['rol']) {
    return this.usersService.findAll(rol);
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
