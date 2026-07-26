import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Clientes } from '../clients/entities/client.entity';
import { Servicios } from '../services/entities/service.entity';
import { ClientMembership } from './entities/client-membership.entity';
import { LoyaltyTier } from './entities/loyalty-tier.entity';
import { LoyaltyTransaction } from './entities/loyalty-transaction.entity';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Clientes,
      Servicios,
      LoyaltyTier,
      ClientMembership,
      LoyaltyTransaction,
    ]),
  ],
  controllers: [LoyaltyController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
