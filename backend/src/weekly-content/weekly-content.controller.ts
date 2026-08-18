import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { WeeklyContentService } from './weekly-content.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiControllerDocs } from '../common/swagger/api-docs.decorators';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';

export class ReviewSubmissionDto {
  @ApiProperty({
    enum: ['aprobar_publica', 'aprobar_privada', 'rechazar'],
    example: 'aprobar_publica',
  })
  @IsNotEmpty()
  @IsEnum(['aprobar_publica', 'aprobar_privada', 'rechazar'])
  action: 'aprobar_publica' | 'aprobar_privada' | 'rechazar';
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
    );
  }
}
