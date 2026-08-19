import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Usuarios } from '../users/entities/user.entity';
import { CandidateScreeningService } from './candidate-screening.service';
import {
  CreateCandidateScreeningDto,
  CreateScreeningQuestionDto,
  PromoteCandidateScreeningDto,
  ReorderScreeningQuestionsDto,
  UpdateScreeningQuestionDto,
} from './dto/candidate-screening.dto';
import { CandidateScreening } from './entities/candidate-screening.entity';

@ApiTags('candidate-screening')
@ApiBearerAuth('jwt')
@Controller('candidate-screening')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class CandidateScreeningController {
  constructor(private readonly service: CandidateScreeningService) {}

  @Get('questions')
  listQuestions() {
    return this.service.listQuestions();
  }

  @Post('questions')
  createQuestion(@Body() dto: CreateScreeningQuestionDto) {
    return this.service.createQuestion(dto);
  }

  @Patch('questions/:id')
  updateQuestion(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateScreeningQuestionDto,
  ) {
    return this.service.updateQuestion(id, dto);
  }

  @Delete('questions/:id')
  deleteQuestion(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.deleteQuestion(id);
  }

  @Post('questions/reorder')
  reorderQuestions(@Body() dto: ReorderScreeningQuestionsDto) {
    return this.service.reorderQuestions(dto);
  }

  @Get()
  listScreenings(@Query('status') status?: CandidateScreening['status']) {
    return this.service.listScreenings(status);
  }

  @Get(':id')
  getScreening(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.getScreeningDetail(id);
  }

  @Post()
  createScreening(
    @Body() dto: CreateCandidateScreeningDto,
    @GetUser() actor: Usuarios,
  ) {
    return this.service.createScreening(dto, actor.id);
  }

  @Patch(':id/promote')
  promote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: PromoteCandidateScreeningDto,
  ) {
    return this.service.markPromoted(id, dto.employeeId);
  }
}
