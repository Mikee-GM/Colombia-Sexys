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

  /**
   * Conversaciones que nunca llegaron a convertirse en servicio. Solo admin:
   * ver estos endpoints en el resto del controller sirve para acordarse de
   * que aqui no aplica el filtro por jefe de los demas, porque no hay
   * servicio ni jefe al que atribuirselas.
   */
  @Get('unlinked-sessions')
  listUnlinkedSessions(
    @Query('limit') limit: string | undefined,
    @Req() req: any,
  ) {
    return this.conversationsService.listUnlinkedSessions(
      req.user,
      limit ? Number(limit) : 100,
    );
  }

  @Get('session/:bookingSessionId')
  findByBookingSession(
    @Param('bookingSessionId') bookingSessionId: string,
    @Req() req: any,
  ) {
    return this.conversationsService.findByBookingSession(
      bookingSessionId,
      req.user,
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

  @Post('service/:serviceId/pause-ai')
  pauseAi(@Param('serviceId') serviceId: string, @Req() req: any) {
    return this.conversationsService.pauseAi(serviceId, req.user);
  }

  @Post('service/:serviceId/resume-ai')
  resumeAi(@Param('serviceId') serviceId: string, @Req() req: any) {
    return this.conversationsService.resumeAi(serviceId, req.user);
  }

  @Post('service/:serviceId/admin-message')
  sendAdminMessage(
    @Param('serviceId') serviceId: string,
    @Body() dto: { message: string; asIdentity?: 'empleada' | 'jefe' | 'ia' },
    @Req() req: any,
  ) {
    return this.conversationsService.sendAdminMessage(
      serviceId,
      req.user,
      dto.message,
      dto.asIdentity || 'jefe',
    );
  }
}
