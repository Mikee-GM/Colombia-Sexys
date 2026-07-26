import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);

  constructor(private readonly configService: ConfigService) {}

  async generateChatResponse(
    systemPrompt: string,
    history: { role: string; content: string }[],
  ): Promise<string> {
    const apiKey = this.configService.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not defined in environment variables');
    }

    const messages = [{ role: 'system', content: systemPrompt }, ...history];

    // Explicit 30 seconds timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages,
          }),
          signal: controller.signal,
        },
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        this.logger.error('Groq API call timed out after 30 seconds');
        throw new Error(
          'La llamada a la API de IA superó el tiempo límite de espera.',
        );
      }
      this.logger.error('Failed to call Groq API:', err.message);
      throw err;
    }
  }

  async analyzeReceipt(imageUrl: string, expectedAmount: number): Promise<any> {
    const apiKey = this.configService.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      throw new Error('GROQ_API_KEY is not defined in environment variables');
    }

    const systemPrompt = `Eres un auditor financiero especializado en comprobantes bancarios mexicanos.
No eres un OCR. No eres un chatbot. Tu única función es inspeccionar la imagen y devolver un JSON perfectamente estructurado.
El monto esperado a pagar es ${expectedAmount}.

Devuelve estrictamente un JSON con esta estructura (si un dato no existe usa null):
{
  "esComprobante": boolean,
  "bancoOrigen": string | null,
  "bancoDestino": string | null,
  "titularDestino": string | null,
  "cuentaDestino": string | null,
  "ultimos4CuentaDestino": string | null,
  "clabe": string | null,
  "monto": string | null,
  "fechaTransferencia": string | null,
  "horaTransferencia": string | null,
  "referencia": string | null,
  "folio": string | null,
  "idSpei": string | null,
  "concepto": string | null,
  "estadoVisual": {
    "imagenCompleta": boolean,
    "textoLegible": boolean,
    "sinRecortes": boolean,
    "sinEdicionVisible": boolean
  },
  "analisisIA": {
    "confianza": number (0-100),
    "nivelRiesgo": "BAJO" | "MEDIO" | "ALTO",
    "posibleFraude": boolean,
    "alertas": string[]
  }
}`;

    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: systemPrompt },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      },
    ];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'llama-3.2-90b-vision-preview',
            messages,
            response_format: { type: 'json_object' },
            temperature: 0.1,
          }),
          signal: controller.signal,
        },
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '{}';

      try {
        const parsed = JSON.parse(content);
        return parsed;
      } catch (e) {
        this.logger.error('Failed to parse Groq response as JSON', content);
        return {
          esComprobante: false,
          analisisIA: {
            posibleFraude: true,
            alertas: ['Error al procesar JSON'],
          },
        };
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      this.logger.error('Failed to call Groq Vision API:', err.message);
      return {
        esComprobante: false,
        analisisIA: {
          posibleFraude: true,
          alertas: ['Error de conexión con IA'],
        },
      };
    }
  }
}
