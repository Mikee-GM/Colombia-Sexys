import {
  IsBoolean,
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
  @IsNumber()
  @Min(0.01)
  amount: number;
}

/**
 * Cierre del costo de un viaje cancelado. A diferencia de `UberFareDto` admite
 * cero, que es como se declara que el viaje nunca llego a salir.
 */
export class CancelledTripCostDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount: number;

  /**
   * Si el costo se le carga al cliente o lo absorbe la casa. Se decide caso por
   * caso: depende de quien causo la cancelacion y de con cuanto tiempo aviso.
   */
  @IsOptional()
  @IsBoolean()
  chargeToClient?: boolean;
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
