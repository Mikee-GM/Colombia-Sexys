import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Usuarios } from '../users/entities/user.entity';
import { CreateLiquidationRecordDto } from './dto/create-liquidation-record.dto';
import { CreateDebtDto, CreateDebtPaymentDto } from './dto/debt.dto';
import { LiquidationPeriodQueryDto } from './dto/liquidation-query.dto';
import { UpdateLiquidationRecordDto } from './dto/update-liquidation-record.dto';
import { LiquidationsService } from './liquidations.service';

@ApiTags('liquidations')
@ApiBearerAuth('jwt')
@Controller('liquidations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'jefe', 'empleada')
export class LiquidationsController {
  constructor(private readonly service: LiquidationsService) {}

  @Get('records')
  @Roles('admin', 'jefe')
  getRecords(
    @Query() query: LiquidationPeriodQueryDto,
    @GetUser() actor: Usuarios,
  ) {
    return this.service.getRecords(query, actor);
  }

  @Post('records')
  createRecord(
    @Body() dto: CreateLiquidationRecordDto,
    @GetUser() actor: Usuarios,
  ) {
    return this.service.createRecord(dto, actor);
  }

  @Patch('records/:recordId')
  @Roles('admin')
  updateRecord(
    @Param('recordId', new ParseUUIDPipe()) recordId: string,
    @Body() dto: UpdateLiquidationRecordDto,
    @GetUser() actor: Usuarios,
  ) {
    return this.service.updateRecord(recordId, dto, actor);
  }

  @Get('employees')
  @Roles('admin', 'jefe')
  getEmployees(
    @Query() query: LiquidationPeriodQueryDto,
    @GetUser() actor: Usuarios,
  ) {
    return this.service.getActiveEmployees(query, actor);
  }

  @Get('report')
  @Roles('admin', 'jefe')
  getReport(
    @Query() query: LiquidationPeriodQueryDto,
    @GetUser() actor: Usuarios,
  ) {
    return this.service.getReport(query, actor);
  }

  @Post('weekly-settlements/confirm')
  @Roles('admin')
  confirmWeeklySettlement(
    @Body() query: LiquidationPeriodQueryDto,
    @GetUser() actor: Usuarios,
  ) {
    return this.service.confirmWeeklySettlement(query, actor);
  }

  @Get('employees/:employeeId/debts')
  @Roles('admin', 'jefe')
  getDebts(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @GetUser() actor: Usuarios,
  ) {
    return this.service.listDebts(employeeId, actor);
  }

  @Post('employees/:employeeId/debts')
  @Roles('admin', 'jefe')
  createDebt(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: CreateDebtDto,
    @GetUser() actor: Usuarios,
  ) {
    return this.service.createDebt(employeeId, dto, actor);
  }

  @Delete('employees/:employeeId/debts/:debtId')
  @Roles('admin')
  @HttpCode(204)
  deleteDebt(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('debtId', new ParseUUIDPipe()) debtId: string,
    @GetUser() actor: Usuarios,
  ) {
    return this.service.deleteDebt(employeeId, debtId, actor);
  }

  @Post('employees/:employeeId/debts/:debtId/payments')
  @Roles('admin', 'jefe')
  addPayment(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('debtId', new ParseUUIDPipe()) debtId: string,
    @Body() dto: CreateDebtPaymentDto,
    @GetUser() actor: Usuarios,
  ) {
    return this.service.addPayment(employeeId, debtId, dto, actor);
  }

  @Delete('employees/:employeeId/debts/:debtId/payments/:paymentId')
  @Roles('admin')
  @HttpCode(204)
  deletePayment(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Param('debtId', new ParseUUIDPipe()) debtId: string,
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
    @GetUser() actor: Usuarios,
  ) {
    return this.service.deletePayment(employeeId, debtId, paymentId, actor);
  }
}
