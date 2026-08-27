import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

import { LiquidationPeriodQueryDto } from './liquidation-query.dto';

/**
 * Deshacer la liquidacion semanal ya confirmada de una empleada.
 *
 * Hereda el periodo porque el corte se identifica por (empleada, semana), igual
 * que al confirmarlo: no hay un id que la pantalla conozca de antemano.
 */
export class UndoSettlementDto extends LiquidationPeriodQueryDto {
  /** Por que se deshizo. Queda en el historial y en el asiento de auditoria. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 240)
  reason?: string;
}
