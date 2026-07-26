import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CloseConductReportDto,
  CreateConductReportDto,
  CreateRatingDto,
  CreateSanctionDto,
  RevokeSanctionDto,
} from './dto/discipline.dto';
import { DisciplineService } from './discipline.service';

@Controller('discipline')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DisciplineController {
  constructor(private readonly discipline: DisciplineService) {}

  @Post('ratings')
  @Roles('empleada', 'chofer')
  createRating(@Req() req: any, @Body() dto: CreateRatingDto) {
    return this.discipline.createRating(req.user, dto);
  }

  @Get('reputation/me')
  @Roles('empleada', 'chofer')
  ownReputation(@Req() req: any) {
    return this.discipline.ownReputation(req.user);
  }

  @Post('reports')
  @Roles('empleada', 'chofer')
  createReport(@Req() req: any, @Body() dto: CreateConductReportDto) {
    return this.discipline.createReport(req.user, dto);
  }

  @Get('reports')
  @Roles('admin', 'jefe')
  listReports(@Req() req: any, @Query() filters: Record<string, string>) {
    return this.discipline.listReports(req.user, filters);
  }

  @Post('reports/:id/close')
  @Roles('admin')
  closeReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @Body() dto: CloseConductReportDto,
  ) {
    return this.discipline.closeReport(id, dto, req.user);
  }

  @Get('dossiers/:subjectType/:subjectId')
  @Roles('admin', 'jefe')
  dossier(
    @Param('subjectType') subjectType: 'client' | 'employee' | 'driver',
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @Req() req: any,
  ) {
    return this.discipline.getDossier(
      req.user,
      subjectType,
      subjectId,
    );
  }

  @Get('sanctions')
  @Roles('admin', 'jefe')
  sanctions(
    @Req() req: any,
    @Query('subjectType') subjectType?: 'client' | 'employee' | 'driver',
    @Query('subjectId') subjectId?: string,
  ) {
    return this.discipline.listSanctions(req.user, subjectType, subjectId);
  }

  @Post('sanctions')
  @Roles('admin')
  createSanction(
    @Body() dto: CreateSanctionDto,
    @Req() req: any,
  ) {
    return this.discipline.createSanction(dto, req.user);
  }

  @Post('sanctions/:id/revoke')
  @Roles('admin')
  revokeSanction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevokeSanctionDto,
    @Req() req: any,
  ) {
    return this.discipline.revokeSanction(id, dto, req.user);
  }
}
