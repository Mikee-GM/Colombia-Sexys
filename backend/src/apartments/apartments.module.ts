import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApartmentsService } from './apartments.service';
import { ApartmentsController } from './apartments.controller';
import { Apartments } from './entities/apartment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Apartments])],
  controllers: [ApartmentsController],
  providers: [ApartmentsService],
  exports: [ApartmentsService, TypeOrmModule],
})
export class ApartmentsModule {}
