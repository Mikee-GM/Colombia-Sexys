import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExtensionesServicio } from './entities/service-extension.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ExtensionesServicio])],
  exports: [TypeOrmModule],
})
export class ServiceExtensionsModule {}
