import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CandidateScreeningController } from './candidate-screening.controller';
import { CandidateScreeningService } from './candidate-screening.service';
import { CandidateScreening } from './entities/candidate-screening.entity';
import { CandidateScreeningAnswer } from './entities/candidate-screening-answer.entity';
import { ScreeningQuestion } from './entities/screening-question.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ScreeningQuestion,
      CandidateScreening,
      CandidateScreeningAnswer,
    ]),
  ],
  controllers: [CandidateScreeningController],
  providers: [CandidateScreeningService],
  exports: [CandidateScreeningService],
})
export class CandidateScreeningModule {}
