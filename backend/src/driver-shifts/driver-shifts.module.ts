import { NotificationsModule } from '../notifications/notifications.module';
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Choferes } from '../drivers/entities/driver.entity';
import { TelegramModule } from '../telegram/telegram.module';
import { DriverShiftsController } from './driver-shifts.controller';
import { DriverShiftsService } from './driver-shifts.service';
import { DriverShiftAssignment } from './entities/driver-shift-assignment.entity';
import { DriverShift } from './entities/driver-shift.entity';

@Module({
  imports: [
    NotificationsModule,
    TypeOrmModule.forFeature([DriverShift, DriverShiftAssignment, Choferes]),
    forwardRef(() => TelegramModule),
  ],
  controllers: [DriverShiftsController],
  providers: [DriverShiftsService],
  exports: [DriverShiftsService],
})
export class DriverShiftsModule {}
