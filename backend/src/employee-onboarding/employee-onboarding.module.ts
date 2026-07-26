import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Empleadas } from '../employees/entities/employee.entity';
import { Usuarios } from '../users/entities/user.entity';
import { EmployeeOnboardingController } from './employee-onboarding.controller';
import { EmployeeOnboardingService } from './employee-onboarding.service';
import { EmployeeOnboarding } from './entities/employee-onboarding.entity';
import { EmployeeRegulation } from './entities/employee-regulation.entity';
import { QuestionnaireAnswer } from './entities/questionnaire-answer.entity';
import { QuestionnaireAttempt } from './entities/questionnaire-attempt.entity';
import { RegulationOption } from './entities/regulation-option.entity';
import { RegulationQuestion } from './entities/regulation-question.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmployeeRegulation,
      RegulationQuestion,
      RegulationOption,
      EmployeeOnboarding,
      QuestionnaireAttempt,
      QuestionnaireAnswer,
      Empleadas,
      Usuarios,
    ]),
  ],
  controllers: [EmployeeOnboardingController],
  providers: [EmployeeOnboardingService],
  exports: [EmployeeOnboardingService],
})
export class EmployeeOnboardingModule {}
