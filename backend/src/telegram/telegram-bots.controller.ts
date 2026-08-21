import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
  UsePipes,
  ValidationPipe,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, MinLength } from 'class-validator';
import { Update } from 'telegraf/typings/core/types/typegram';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { EmployeeTelegramBot } from './entities/employee-telegram-bot.entity';
import { TelegramBotRegistryService } from './telegram-bot-registry.service';

export class SetEmployeeBotTokenDto {
  @IsString()
  @MinLength(30)
  token: string;
}

/** Vista del bot que sí puede salir hacia el panel: nunca incluye el token. */
export interface EmployeeBotView {
  employeeId: string;
  status: string;
  tokenHint: string | null;
  botUsername: string | null;
  lastError: string | null;
  updatedAt: Date | null;
}

function toView(record: EmployeeTelegramBot): EmployeeBotView {
  return {
    employeeId: record.employeeId,
    status: record.status,
    tokenHint: record.tokenHint,
    botUsername: record.botUsername,
    lastError: record.lastError,
    updatedAt: record.updatedAt,
  };
}

@Controller('telegram')
export class TelegramBotsController {
  constructor(
    private readonly registry: TelegramBotRegistryService,
    @InjectRepository(EmployeeTelegramBot)
    private readonly botsRepository: Repository<EmployeeTelegramBot>,
  ) {}

  /**
   * Endpoint que llama Telegram. Es público a propósito: la autenticación es el
   * secreto que viaja en `X-Telegram-Bot-Api-Secret-Token`, que solo conocen
   * Telegram y nosotros.
   */
  @Post('webhook/:recordId')
  @HttpCode(200)
  async webhook(
    @Param('recordId', new ParseUUIDPipe()) recordId: string,
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body() update: Update,
  ): Promise<{ ok: boolean }> {
    const handled = await this.registry.handleWebhookUpdate(
      recordId,
      secret,
      update,
    );
    if (!handled) {
      throw new ForbiddenException();
    }
    return { ok: true };
  }

  @Get('bots')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async list(): Promise<EmployeeBotView[]> {
    const records = await this.botsRepository.find();
    return records.map(toView);
  }

  @Put('bots/:employeeId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async setToken(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: SetEmployeeBotTokenDto,
  ): Promise<EmployeeBotView> {
    const record = await this.registry.setToken(employeeId, dto.token);
    return toView(record);
  }

  @Delete('bots/:employeeId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @HttpCode(204)
  async removeToken(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ): Promise<void> {
    await this.registry.removeToken(employeeId);
  }
}
