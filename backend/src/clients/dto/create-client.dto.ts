import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateClientDto {
  @ApiProperty({
    description: 'Chat ID de Telegram del cliente',
    example: '123456789',
  })
  @IsNumberString({}, { message: 'El chat ID de Telegram debe ser numérico' })
  readonly telegramChatId: string;

  @ApiPropertyOptional({
    description: 'Nombre visible del cliente en Telegram',
    example: 'Juan',
    maxLength: 255,
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @MaxLength(255, { message: 'El nombre no puede superar los 255 caracteres' })
  @IsOptional()
  readonly nombreTelegram?: string;
}
