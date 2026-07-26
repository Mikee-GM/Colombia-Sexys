import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiProviderService } from './ai-provider.service';
import { AiMessageService } from './ai-message.service';

@Module({
  imports: [ConfigModule],
  providers: [AiProviderService, AiMessageService],
  exports: [AiProviderService, AiMessageService],
})
export class AiModule {}
