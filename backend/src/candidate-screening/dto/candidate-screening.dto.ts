import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateScreeningQuestionDto {
  @IsString() @MinLength(3) @MaxLength(2000) text: string;
}

export class UpdateScreeningQuestionDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(2000) text?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ReorderScreeningQuestionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  questionIds: string[];
}

export class CreateCandidateScreeningDto {
  @IsString() @MinLength(2) @MaxLength(255) candidateName: string;
  @IsOptional() @IsString() @MaxLength(30) candidatePhone?: string;
  @Type(() => String)
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  questionIds: string[];
}

export class PromoteCandidateScreeningDto {
  @IsUUID() employeeId: string;
}
