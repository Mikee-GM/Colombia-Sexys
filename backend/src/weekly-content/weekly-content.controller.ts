import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { WeeklyContentService } from './weekly-content.service';
import type { SubmissionStatus } from './entities/weekly-photo-submission.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiControllerDocs } from '../common/swagger/api-docs.decorators';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Tope del motivo de rechazo. Da para explicar qué corregir sin que el aviso
 * de Telegram se convierta en un muro de texto.
 */
const MOTIVO_RECHAZO_MAX = 300;

export class ReviewSubmissionDto {
  @ApiProperty({
    enum: ['aprobar_publica', 'aprobar_privada', 'rechazar'],
    example: 'aprobar_publica',
  })
  @IsNotEmpty()
  @IsEnum(['aprobar_publica', 'aprobar_privada', 'rechazar'])
  action: 'aprobar_publica' | 'aprobar_privada' | 'rechazar';

  /**
   * Motivo del rechazo. Se ignora al aprobar, y es opcional al rechazar: se
   * prefiere un rechazo sin explicar a que la cola se atasque porque el
   * revisor no encuentra como redactarlo.
   */
  @ApiPropertyOptional({
    description: 'Por qué se rechaza la foto. Le llega a la empleada.',
    maxLength: MOTIVO_RECHAZO_MAX,
    example: 'La foto está movida y se ve a otra persona al fondo.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(MOTIVO_RECHAZO_MAX)
  motivo?: string;
}

@Controller('weekly-content')
@ApiControllerDocs('weekly-content', true)
@UseGuards(JwtAuthGuard, RolesGuard)
export class WeeklyContentController {
  constructor(private readonly weeklyContentService: WeeklyContentService) {}

  @Get('summary')
  @Roles('admin', 'jefe')
  async getSummary() {
    const [pendingCounts, weeklyStatuses] = await Promise.all([
      this.weeklyContentService.getPendingCountByEmployee(),
      this.weeklyContentService.getWeeklyStatusForEmployees(),
    ]);
    return {
      pendingCounts,
      weeklyStatuses,
    };
  }

  // Cola de revision global: sin esto la pantalla pediria una peticion por modelo.
  @Get('submissions')
  @Roles('admin', 'jefe')
  async listSubmissions(
    @Query('estado') estado?: SubmissionStatus,
    @Query('limit') limit?: string,
  ) {
    return this.weeklyContentService.listSubmissions(
      estado,
      limit ? Number(limit) : undefined,
    );
  }

  @Get('employee/:empleadaId')
  @Roles('admin', 'jefe')
  async getByEmployee(
    @Param('empleadaId') empleadaId: string,
    @Query('onlyPending') onlyPending?: string,
  ) {
    return this.weeklyContentService.getSubmissionsByEmployee(
      empleadaId,
      onlyPending === 'true',
    );
  }

  @Post('submissions/:id/review')
  @Roles('admin', 'jefe')
  async reviewSubmission(
    @Param('id') id: string,
    @Body() dto: ReviewSubmissionDto,
    @Req() req: any,
  ) {
    return this.weeklyContentService.reviewSubmission(
      id,
      dto.action,
      req.user,
      dto.motivo,
    );
  }

  // Borrado de una foto ya revisada: la baja del catalogo o de exclusivas y
  // limpia el registro. Solo admin, por ser destructivo e irreversible.
  @Delete('submissions/:id')
  @Roles('admin')
  async deleteSubmission(@Param('id') id: string) {
    return this.weeklyContentService.deleteSubmission(id);
  }
}
