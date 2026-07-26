import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RealtimeModule } from '../realtime/realtime.module';
import { DisciplineController } from './discipline.controller';
import { DisciplineService } from './discipline.service';
import { ConductReport } from './entities/conduct-report.entity';
import { DisciplinarySanction } from './entities/disciplinary-sanction.entity';
import { InteractionRating } from './entities/interaction-rating.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InteractionRating,
      ConductReport,
      DisciplinarySanction,
    ]),
    RealtimeModule,
  ],
  controllers: [DisciplineController],
  providers: [DisciplineService],
  exports: [DisciplineService],
})
export class DisciplineModule {}
