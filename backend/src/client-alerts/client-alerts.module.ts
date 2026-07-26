import { Module } from '@nestjs/common';
import { ClientAlertsService } from './client-alerts.service';
import { ClientAlertsController } from './client-alerts.controller';

@Module({
  controllers: [ClientAlertsController],
  providers: [ClientAlertsService],
})
export class ClientAlertsModule {}
