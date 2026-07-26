import { Module } from '@nestjs/common';
import { ServiceExtrasService } from './service-extras.service';
import { ServiceExtrasController } from './service-extras.controller';

@Module({
  controllers: [ServiceExtrasController],
  providers: [ServiceExtrasService],
})
export class ServiceExtrasModule {}
