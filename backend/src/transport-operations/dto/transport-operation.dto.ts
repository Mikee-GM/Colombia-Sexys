import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class UpdateTransportSettingDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  externalLocationFee: number;
}

/**
 * El área que se atiende. Va en su propio DTO y su propio endpoint porque no
 * es una tarifa: cambiarla decide qué clientes existen y cuáles se rechazan
 * antes de cotizarles nada.
 */
export class UpdateCoverageAreaDto {
  @IsString() @Length(2, 80) coverageCity: string;
  @Type(() => Number) @IsLatitude() coverageCenterLat: number;
  @Type(() => Number) @IsLongitude() coverageCenterLng: number;
  /*
   * El tope de 500 km es el mismo que el CHECK de la tabla. Un radio mayor
   * dejaria de ser un area de cobertura para ser medio pais, que es justo lo
   * que esto viene a impedir.
   */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(500)
  coverageRadiusKm: number;
}

export class SavePresetLocationDto {
  @IsString() @Length(1, 80) name: string;
  @IsString() @Length(1, 240) address: string;
  @Type(() => Number) @IsLatitude() latitude: number;
  @Type(() => Number) @IsLongitude() longitude: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}
