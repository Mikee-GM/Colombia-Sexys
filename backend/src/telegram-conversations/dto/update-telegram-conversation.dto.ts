import { PartialType } from '@nestjs/swagger';
import { CreateTelegramConversationDto } from './create-telegram-conversation.dto';

export class UpdateTelegramConversationDto extends PartialType(
  CreateTelegramConversationDto,
) {}
