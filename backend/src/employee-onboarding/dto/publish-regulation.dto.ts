import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegulationOptionDto {
  @ApiProperty({ example: 'Lavarse las manos y usar uniforme limpio.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  readonly text: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  readonly isCorrect: boolean;
}

export class RegulationQuestionDto {
  @ApiProperty({ example: '¿Qué debes hacer antes de manipular alimentos?' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  readonly text: string;

  @ApiProperty({ type: [RegulationOptionDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => RegulationOptionDto)
  readonly options: RegulationOptionDto[];
}

export class PublishRegulationDto {
  @ApiProperty({ example: 'Reglamento básico de trabajo' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  readonly title: string;

  @ApiProperty({ example: '1. Mantén una higiene adecuada...' })
  @IsString()
  @IsNotEmpty()
  readonly content: string;

  @ApiProperty({ example: 80, minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  readonly passingScore: number;

  @ApiProperty({
    example: 'empleada',
    enum: ['empleada', 'chofer', 'jefe'],
    required: false,
  })
  @IsString()
  @IsNotEmpty()
  readonly targetRole?: 'empleada' | 'chofer' | 'jefe';

  @ApiProperty({ type: [RegulationQuestionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RegulationQuestionDto)
  readonly questions: RegulationQuestionDto[];
}
