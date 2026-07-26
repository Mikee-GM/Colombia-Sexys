import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TelegramConversationsService } from './telegram-conversations.service';
import { CreateTelegramConversationDto } from './dto/create-telegram-conversation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiControllerDocs } from '../common/swagger/api-docs.decorators';

@Controller('telegram-conversations')
@ApiControllerDocs('telegram-conversations', true)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'jefe')
export class TelegramConversationsController {
  constructor(
    private readonly conversationsService: TelegramConversationsService,
  ) {}

  @Get('service/:serviceId')
  findByService(
    @Param('serviceId') serviceId: string,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @Req() req: any,
  ) {
    return this.conversationsService.findByService(
      serviceId,
      req.user,
      cursor,
      limit ? Number(limit) : 50,
    );
  }

  @Post('service/:serviceId/messages')
  sendMessage(
    @Param('serviceId') serviceId: string,
    @Body() dto: CreateTelegramConversationDto,
    @Req() req: any,
  ) {
    return this.conversationsService.sendBossMessage(
      serviceId,
      req.user,
      dto.message,
    );
  }
}
