import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTelegramConversationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message: string;
}
