import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminServiceLifecycleService } from './admin-service-lifecycle.service';
import {
  AdminServiceReasonDto,
  HardDeleteServiceDto,
} from './dto/admin-service-control.dto';

@Controller('admin/service-control')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminServiceLifecycleController {
  constructor(private readonly lifecycle: AdminServiceLifecycleService) {}

  @Post(':id/cancel-or-void')
  cancelOrVoid(
    @Param('id') id: string,
    @Body() dto: AdminServiceReasonDto,
    @Req() req: any,
  ) {
    return this.lifecycle.administrativelyCancel(id, req.user, dto.reason);
  }

  @Delete(':id')
  softDelete(
    @Param('id') id: string,
    @Body() dto: AdminServiceReasonDto,
    @Req() req: any,
  ) {
    return this.lifecycle.softDelete(id, req.user, dto.reason);
  }

  @Post(':id/restore')
  restore(
    @Param('id') id: string,
    @Body() dto: AdminServiceReasonDto,
    @Req() req: any,
  ) {
    return this.lifecycle.restore(id, req.user, dto.reason);
  }

  @Post(':id/hard-delete')
  hardDelete(
    @Param('id') id: string,
    @Body() dto: HardDeleteServiceDto,
    @Req() req: any,
  ) {
    return this.lifecycle.hardDelete(
      id,
      req.user,
      dto.reason,
      dto.confirmation,
    );
  }
}
