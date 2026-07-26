import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogExtrasService } from './catalog-extras.service';
import { CatalogExtrasController } from './catalog-extras.controller';
import { ExtrasCatalogo } from './entities/catalog-extra.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ExtrasCatalogo])],
  controllers: [CatalogExtrasController],
  providers: [CatalogExtrasService],
  exports: [CatalogExtrasService],
})
export class CatalogExtrasModule {}
