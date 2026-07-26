import { Module } from '@nestjs/common';
import { ExtensionsService } from './extensions.service';
import { ExtensionsController } from './extensions.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Prorrogas } from './entities/extension.entity';
import { Servicios } from '../services/entities/service.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Prorrogas, Servicios])],
  controllers: [ExtensionsController],
  providers: [ExtensionsService],
  exports: [ExtensionsService],
})
export class ExtensionsModule {}
