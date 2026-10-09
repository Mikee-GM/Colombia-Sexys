import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ServiceHistoryService } from './service-history.service';

@Controller('service-history')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ServiceHistoryController {
  constructor(private readonly history: ServiceHistoryService) {}

  @Get('weekly')
  @Roles('admin', 'jefe', 'empleada')
  weekly(
    @Req() req: any,
    @Query('weekStart') weekStart?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.history.weekly(req.user, { weekStart, employeeId });
  }

  @Get('trash')
  @Roles('admin')
  trash(@Req() req: any) {
    return this.history.trash(req.user);
  }
}
