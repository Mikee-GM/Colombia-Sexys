import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WeeklyPhotoSubmission } from './entities/weekly-photo-submission.entity';
import { WeeklyContentSchedule } from './entities/weekly-content-schedule.entity';
import { WeeklyContentService } from './weekly-content.service';
import { WeeklyContentController } from './weekly-content.controller';
import { WeeklyContentScheduler } from './weekly-content.scheduler';
import { Empleadas } from '../employees/entities/employee.entity';
import { EmpleadaFotos } from '../employee-photos/entities/employee-photo.entity';
import { EmpleadaFotosExclusivas } from '../employee-photos/entities/employee-private-photo.entity';
import { ConductReport } from '../discipline/entities/conduct-report.entity';
import { TelegramModule } from '../telegram/telegram.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WeeklyPhotoSubmission,
      WeeklyContentSchedule,
      Empleadas,
      EmpleadaFotos,
      EmpleadaFotosExclusivas,
      ConductReport,
    ]),
    forwardRef(() => TelegramModule),
    UploadModule,
  ],
  controllers: [WeeklyContentController],
  providers: [WeeklyContentService, WeeklyContentScheduler],
  exports: [WeeklyContentService],
})
export class WeeklyContentModule {}
