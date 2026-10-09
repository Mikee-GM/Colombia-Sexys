import { IsString, MaxLength, MinLength } from 'class-validator';

export class AdminServiceReasonDto {
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reason: string;
}

export class HardDeleteServiceDto extends AdminServiceReasonDto {
  @IsString()
  confirmation: string;
}
