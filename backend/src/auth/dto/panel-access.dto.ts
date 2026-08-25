import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class PanelAccessDto {
  @ApiProperty({ description: 'Pase de vida corta entregado por el bot' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  token: string;

  @ApiPropertyOptional({
    description: 'Chat de Telegram que abrió el enlace, si se conoce',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  chatId?: string;
}
