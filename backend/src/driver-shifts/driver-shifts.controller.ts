import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { DriverShiftsService } from './driver-shifts.service';
import {
  AssignDriverShiftDto,
  CreateDriverShiftDto,
  UpdateDriverShiftDto,
} from './dto/driver-shifts.dto';

@ApiTags('driver-shifts')
@ApiBearerAuth('jwt')
@Controller('driver-shifts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class DriverShiftsController {
  constructor(private readonly driverShifts: DriverShiftsService) {}

  @Get()
  list() {
    return this.driverShifts.listShifts();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.driverShifts.getShift(id);
  }

  @Get(':id/candidates')
  candidates(@Param('id', ParseUUIDPipe) id: string) {
    return this.driverShifts.listCandidates(id);
  }

  @Post()
  create(@Body() dto: CreateDriverShiftDto, @Req() req: any) {
    return this.driverShifts.createShift(dto, req.user.id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDriverShiftDto,
  ) {
    return this.driverShifts.updateShift(id, dto);
  }

  @Post(':id/deactivate')
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.driverShifts.deactivateShift(id);
  }

  @Post(':id/assign')
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignDriverShiftDto,
  ) {
    return this.driverShifts.assignDriver(id, dto);
  }

  @Delete(':id/assign/:driverId')
  unassign(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('driverId', ParseUUIDPipe) driverId: string,
  ) {
    return this.driverShifts.unassignDriver(id, driverId);
  }
}
