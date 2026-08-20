import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RealtimeModule } from '../realtime/realtime.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ChallengesController } from './challenges.controller';
import { ChallengesScheduler } from './challenges.scheduler';
import { ChallengesService } from './challenges.service';
import { ChallengeParticipant } from './entities/challenge-participant.entity';
import { Challenge } from './entities/challenge.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Challenge, ChallengeParticipant]),
    RealtimeModule,
    forwardRef(() => TelegramModule),
  ],
  controllers: [ChallengesController],
  providers: [ChallengesService, ChallengesScheduler],
  exports: [ChallengesService],
})
export class ChallengesModule {}
