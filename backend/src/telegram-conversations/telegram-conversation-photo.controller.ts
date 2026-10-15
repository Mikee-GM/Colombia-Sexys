import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Usuarios } from '../users/entities/user.entity';
import { TelegramConversationPhotoService } from './telegram-conversation-photo.service';

@Controller('telegram-conversations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'jefe')
export class TelegramConversationPhotoController {
  constructor(private readonly photos: TelegramConversationPhotoService) {}

  @Get('messages/:messageId/photo')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'")
  async photo(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Req() request: { user: Usuarios },
  ): Promise<StreamableFile> {
    const { buffer, contentType } = await this.photos.readPhoto(
      messageId,
      request.user,
    );
    return new StreamableFile(buffer, {
      type: contentType,
      disposition: 'inline',
      length: buffer.length,
    });
  }
}
