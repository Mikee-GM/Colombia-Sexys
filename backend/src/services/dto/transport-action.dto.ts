import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SelectTransportDto {
  @IsIn(['chofer', 'uber'])
  transportType: 'chofer' | 'uber';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bossNotes?: string;
}

export class UberFareDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;
}

export class UberStatusDto {
  @IsIn(['en_camino', 'llegado'])
  status: 'en_camino' | 'llegado';
}

export class SendServiceMessageDto {
  @IsString()
  @MaxLength(4000)
  message: string;
}
