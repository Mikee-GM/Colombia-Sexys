import {
  IsNumber,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class ConfirmReceiptCepDto {
  @IsString()
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9-]+$/)
  claveRastreo: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  fechaTransferencia: string;

  @IsString()
  @MaxLength(100)
  bancoOrigen: string;

  @IsUUID()
  cuentaDestinoId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  monto: number;
}
