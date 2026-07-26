import { Module } from '@nestjs/common';
import { ServiceExtensionsService } from './service-extensions.service';
import { ServiceExtensionsController } from './service-extensions.controller';

@Module({
  controllers: [ServiceExtensionsController],
  providers: [ServiceExtensionsService],
})
export class ServiceExtensionsModule {}
