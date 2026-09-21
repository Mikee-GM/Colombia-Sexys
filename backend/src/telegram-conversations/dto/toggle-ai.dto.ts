import { IsBoolean } from 'class-validator';

export class ToggleAiDto {
  @IsBoolean()
  iaActiva: boolean;
}
