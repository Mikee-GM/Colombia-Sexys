import { Controller, Get, UseGuards } from '@nestjs/common';
import { DriversService } from './drivers.service';
import { PortalAuthGuard } from '../auth/guards/portal-auth.guard';
import { PortalUser } from '../auth/decorators/portal-user.decorator';
import { ApiControllerDocs } from '../common/swagger/api-docs.decorators';

@Controller('driver-portal')
@ApiControllerDocs('driver-portal')
@UseGuards(PortalAuthGuard)
export class DriverPortalController {
  constructor(private readonly driversService: DriversService) {}

  @Get('me')
  getMyPortal(@PortalUser() userId: string) {
    return this.driversService.getDriverPortalData(userId);
  }
}
