import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SavePresetLocationDto, UpdateTransportSettingDto } from './dto/transport-operation.dto';
import { TransportOperationsService } from './transport-operations.service';
import { CashPaymentDto, SettlementPeriodDto } from './dto/settlement.dto';
import { SettlementsService } from './settlements.service';

@Controller('transport-operations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class TransportOperationsController {
  constructor(private readonly service: TransportOperationsService, private readonly settlements: SettlementsService) {}
  @Get('configuration') configuration() { return this.service.getConfiguration(); }
  @Patch('configuration') update(@Body() dto: UpdateTransportSettingDto, @Req() req: any) { return this.service.updateFee(dto.externalLocationFee, req.user.id); }
  @Post('locations') create(@Body() dto: SavePresetLocationDto) { return this.service.createLocation(dto); }
  @Patch('locations/:id') edit(@Param('id') id: string, @Body() dto: SavePresetLocationDto) { return this.service.updateLocation(id, dto); }
  @Delete('locations/:id') remove(@Param('id') id: string) { return this.service.removeLocation(id); }
  @Get('cash-obligations') @Roles('admin', 'jefe') cash(@Req() req: any, @Query('employeeId') employeeId?: string) { return this.settlements.cashSummary(req.user, employeeId); }
  @Post('cash-payments') @Roles('admin', 'jefe') cashPayment(@Body() dto: CashPaymentDto, @Req() req: any) { return this.settlements.registerCashPayment(dto.employeeId, dto.amount, dto.note, req.user); }
  @Post('cash-obligations/:id/close') @Roles('admin', 'jefe') closeCash(@Param('id') id: string, @Req() req: any) { return this.settlements.closeCashObligation(id, req.user); }
  @Get('driver-settlements') driverReport(@Query() period: SettlementPeriodDto) { return this.settlements.driverReport(period.startDate, period.endDate); }
  @Post('driver-settlements/:driverId/pay') settleDriver(@Param('driverId') driverId: string, @Body() period: SettlementPeriodDto, @Req() req: any) { return this.settlements.settleDriver(driverId, period.startDate, period.endDate, req.user.id); }
}
