import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { Usuarios } from './entities/user.entity';
import { UserSeederService } from './user-seeder.service';
import { WorkShiftStatusService } from './work-shift-status.service';
import { WorkShiftResetScheduler } from './work-shift-reset.scheduler';
import { Empleadas } from '../employees/entities/employee.entity';
import { TelegramModule } from '../telegram/telegram.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Usuarios, Empleadas]),
    forwardRef(() => TelegramModule),
    RealtimeModule,
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    UserSeederService,
    WorkShiftStatusService,
    WorkShiftResetScheduler,
  ],
  exports: [UsersService, WorkShiftStatusService],
})
export class UsersModule {}
