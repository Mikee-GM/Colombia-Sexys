import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Length, Min } from 'class-validator';

export class UpdateTransportSettingDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) externalLocationFee: number;
}

export class SavePresetLocationDto {
  @IsString() @Length(1, 80) name: string;
  @IsString() @Length(1, 240) address: string;
  @Type(() => Number) @IsLatitude() latitude: number;
  @Type(() => Number) @IsLongitude() longitude: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}
