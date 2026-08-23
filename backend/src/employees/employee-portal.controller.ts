import { Controller, Get, UseGuards } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { PortalAuthGuard } from '../auth/guards/portal-auth.guard';
import { PortalUser } from '../auth/decorators/portal-user.decorator';
import { ApiControllerDocs } from '../common/swagger/api-docs.decorators';

@Controller('employee-portal')
@ApiControllerDocs('employee-portal')
@UseGuards(PortalAuthGuard)
export class EmployeePortalController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get('me')
  getMyPortal(@PortalUser() userId: string) {
    return this.employeesService.getEmployeePortalData(userId);
  }
}
