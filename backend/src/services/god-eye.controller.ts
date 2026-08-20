import {
  Controller,
  Get,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GodEyeService } from './god-eye.service';
import { ApiControllerDocs } from '../common/swagger/api-docs.decorators';

@Controller('admin/god-eye')
@ApiControllerDocs('god-eye', true)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class GodEyeController {
  constructor(private readonly godEyeService: GodEyeService) {}

  @Get('overview')
  getOverview() {
    return this.godEyeService.getOverview();
  }

  @Get('actors')
  listActors() {
    return this.godEyeService.listAllActors();
  }

  @Get('actor/:type/:id')
  getActorDossier(
    @Param('type') type: 'employee' | 'driver' | 'boss',
    @Param('id') id: string,
  ) {
    return this.godEyeService.getActorDossier(type, id);
  }

  @Get('incident/:serviceId/root-cause')
  getIncidentRootCause(@Param('serviceId') serviceId: string) {
    return this.godEyeService.analyzeIncidentRootCause(serviceId);
  }
}
