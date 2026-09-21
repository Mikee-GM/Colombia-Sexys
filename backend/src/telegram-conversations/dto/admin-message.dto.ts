import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AdminMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message: string;

  @IsOptional()
  @IsIn(['empleada', 'jefe', 'ia'])
  asIdentity?: 'empleada' | 'jefe' | 'ia';
}

export class SessionAdminMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message: string;

  @IsOptional()
  @IsIn(['ia', 'jefe'])
  asIdentity?: 'ia' | 'jefe';
}
