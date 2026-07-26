import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  AssignReportDto,
  ChangeReportPriorityDto,
  CloseReportDto,
  ReportNoteDto,
} from './dto/report-actions.dto';
import { ReportQueryDto } from './dto/report-query.dto';
import { EmployeeReportsService } from './employee-reports.service';

@ApiTags('employee-reports')
@ApiBearerAuth('jwt')
@Controller('employee-reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'jefe')
export class EmployeeReportsController {
  constructor(private readonly service: EmployeeReportsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar reportes paginados' })
  findAll(@Query() query: ReportQueryDto, @Req() req: any) {
    return this.service.findAll(query, req.user);
  }

  @Get('dashboard-summary')
  @ApiOperation({ summary: 'Resumen para tarjetas del dashboard' })
  summary(@Req() req: any) {
    return this.service.dashboardSummary(req.user);
  }

  @Get('tolerance')
  @ApiOperation({ summary: 'Indicadores de tolerancia por empleada' })
  tolerance(@Req() req: any) {
    return this.service.tolerance(req.user);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Historial auditable de un reporte' })
  history(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.service.findHistory(id, req.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle e historial de un reporte' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.service.findOne(id, req.user);
  }

  @Patch(':id/assign')
  @Roles('admin')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignReportDto,
    @Req() req: any,
  ) {
    return this.service.assign(id, dto, req.user);
  }

  @Post(':id/take')
  @Roles('admin')
  take(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.service.take(id, req.user);
  }

  @Patch(':id/priority')
  @Roles('admin')
  priority(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeReportPriorityDto,
    @Req() req: any,
  ) {
    return this.service.changePriority(id, dto, req.user);
  }

  @Post(':id/start-review')
  @Roles('admin')
  review(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.service.startReview(id, req.user);
  }

  @Post(':id/notes')
  @Roles('admin')
  note(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportNoteDto,
    @Req() req: any,
  ) {
    return this.service.addNote(id, dto, req.user);
  }

  @Post(':id/resolve')
  @Roles('admin')
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseReportDto,
    @Req() req: any,
  ) {
    return this.service.close(id, 'resuelto', dto, req.user);
  }

  @Post(':id/dismiss')
  @Roles('admin')
  dismiss(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseReportDto,
    @Req() req: any,
  ) {
    return this.service.close(id, 'descartado', dto, req.user);
  }
}
