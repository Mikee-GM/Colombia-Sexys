import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class SaveBankAccountDto {
  @IsString()
  @MaxLength(100)
  banco: string;

  @IsString()
  @MaxLength(255)
  titular: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  cuenta?: string;

  @ValidateIf((_, value) => value !== undefined && value !== '')
  @IsString()
  @Length(4, 4)
  ultimos4?: string;

  @ValidateIf((_, value) => value !== undefined && value !== '')
  @IsString()
  @Length(18, 18)
  clabe?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  alias?: string;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}
