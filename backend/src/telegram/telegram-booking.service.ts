import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Usuarios } from '../users/entities/user.entity';
import { Clientes } from '../clients/entities/client.entity';
import { Empleadas } from '../employees/entities/employee.entity';
import { Servicios } from '../services/entities/service.entity';
import { ExtrasCatalogo } from '../catalog-extras/entities/catalog-extra.entity';
import { ExtrasServicio } from '../service-extras/entities/service-extra.entity';
import { ServicesService } from '../services/services.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { AiProviderService } from '../ai/ai-provider.service';

@Injectable()
export class TelegramBookingService {
  private readonly logger = new Logger(TelegramBookingService.name);

  constructor(
    @InjectRepository(Usuarios)
    readonly usuariosRepository: Repository<Usuarios>,
    @InjectRepository(Clientes)
    readonly clientesRepository: Repository<Clientes>,
    @InjectRepository(Empleadas)
    readonly empleadasRepository: Repository<Empleadas>,
    @InjectRepository(Servicios)
    readonly serviciosRepository: Repository<Servicios>,
    @InjectRepository(ExtrasCatalogo)
    readonly extrasCatalogoRepository: Repository<ExtrasCatalogo>,
    @InjectRepository(ExtrasServicio)
    readonly extrasServicioRepository: Repository<ExtrasServicio>,
    @Inject(forwardRef(() => ServicesService))
    readonly servicesService: ServicesService,
    readonly loyaltyService: LoyaltyService,
    private readonly aiProviderService: AiProviderService,
    private readonly configService: ConfigService,
  ) {}

  async getGroqResponse(
    systemPrompt: string,
    history: { role: 'user' | 'model'; parts: { text: string }[] }[],
    clientTelegramId?: string,
  ): Promise<string> {
    if (clientTelegramId) {
      const client = await this.clientesRepository.findOne({
        where: { telegramChatId: clientTelegramId },
      });

      if (client) {
        const today = new Date();
        const lastCall = client.lastAiCallAt
          ? new Date(client.lastAiCallAt)
          : null;

        // Comprobar si el día, mes o año cambiaron en la zona horaria del servidor
        const isDifferentDay =
          !lastCall ||
          today.getDate() !== lastCall.getDate() ||
          today.getMonth() !== lastCall.getMonth() ||
          today.getFullYear() !== lastCall.getFullYear();

        if (isDifferentDay) {
          client.aiCallsToday = 0;
        }

        const maxCalls =
          this.configService.get<number>('MAX_DAILY_AI_CALLS') || 15;
        if (client.aiCallsToday >= maxCalls) {
          throw new Error('AI_LIMIT_REACHED');
        }

        client.aiCallsToday += 1;
        client.lastAiCallAt = today;
        await this.clientesRepository.save(client);
      }
    }

    const formattedHistory = history.map((msg) => ({
      role: msg.role === 'model' ? 'assistant' : 'user',
      content: msg.parts?.[0]?.text || '',
    }));

    return this.aiProviderService.generateChatResponse(
      systemPrompt,
      formattedHistory,
    );
  }
}
