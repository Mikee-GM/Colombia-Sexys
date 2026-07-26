import { Injectable, Logger } from '@nestjs/common';
import { AiProviderService } from './ai-provider.service';

export type OperationalMessageEvent =
  | 'booking_received'
  | 'service_accepted'
  | 'service_rejected'
  | 'employee_on_the_way'
  | 'employee_arrived';

@Injectable()
export class AiMessageService {
  private readonly logger = new Logger(AiMessageService.name);

  constructor(private readonly aiProviderService: AiProviderService) {}

  async generate(
    event: OperationalMessageEvent,
    context: Record<string, string | number | null | undefined>,
    fallback: string,
  ): Promise<string> {
    const systemPrompt = `Escribe un mensaje de WhatsApp/Telegram como si fueras la empleada hablando directamente con el cliente en español colombiano casual.
El evento es: ${event}.

Personalidad obligatoria:
- Habla siempre en primera persona: "yo", "voy", "puedo", "llegué".
- Suena espontánea, cercana y ligeramente coqueta, como una conversación real en Colombia.
- Usa de manera natural expresiones colombianas como "listo", "de una", "en un ratico", "ya voy para allá" o "qué pena". No las acumules ni exageres el acento.
- Puedes alargar ocasionalmente una palabra: "oyeee", "siii", "holaaa".
- Usa una sola frase corta, sin saludo formal y con máximo un emoji.

Ejemplos del tono deseado según el evento:
- booking_received: "Listo, dame un momentico y miro si puedo ir contigo"
- service_accepted: "Oyeee, sí puedo ir contigo, nos vemos en un ratico 😊"
- service_rejected: "Qué pena contigo, esta vez no voy a poder ir"
- employee_on_the_way: "Ya voy para allá, nos vemos en un ratico"
- employee_arrived: "Ya llegué al punto que cuadramos, aquí te espero"

Está prohibido hablar como empresa o como otra persona. No uses expresiones como "hemos confirmado", "aceptamos tu solicitud", "su solicitud", "servicios a domicilio", "ha sido aprobado", "nuestro equipo" o "la empleada".
No inventes datos, no resumas la reservación, no uses Markdown, listas, etiquetas técnicas ni comillas. Devuelve solamente el mensaje final.`;

    try {
      const response = await this.aiProviderService.generateChatResponse(
        systemPrompt,
        [
          {
            role: 'user',
            content: `Datos disponibles: ${JSON.stringify(context)}`,
          },
        ],
      );
      return response.trim() || fallback;
    } catch (error) {
      this.logger.warn(
        `No se pudo redactar el mensaje operacional '${event}' con IA; se usará el fallback.`,
      );
      return fallback;
    }
  }

  async generateAgencyMessage(
    event: 'scheduled_eta_updated' | 'employee_available' | 'employee_en_route',
    context: Record<string, string | number | null | undefined>,
    fallback: string,
  ): Promise<string> {
    try {
      const response = await this.aiProviderService.generateChatResponse(
        `Redacta un mensaje breve en español como asistente de la agencia.
Identifícate claramente como asistente y nunca finjas ser la empleada.
Evento: ${event}. No inventes información, no uses Markdown y devuelve solo el mensaje.`,
        [{ role: 'user', content: JSON.stringify(context) }],
      );
      return response.trim() || fallback;
    } catch {
      this.logger.warn(
        `No se pudo redactar el mensaje de agencia '${event}'; se usará el fallback.`,
      );
      return fallback;
    }
  }

  async analyzeReceipt(
    imageUrl: string,
    expectedAmount: number,
  ): Promise<any> {
    return this.aiProviderService.analyzeReceipt(imageUrl, expectedAmount);
  }
}
