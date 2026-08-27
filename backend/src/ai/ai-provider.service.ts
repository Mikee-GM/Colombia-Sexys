import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Modelos por defecto si el entorno no dice otra cosa. */
const DEFAULT_CHAT_MODEL = 'grok-4.3-latest';

/**
 * La vision se queda en el modelo sin razonamiento a proposito: solo extrae
 * datos de comprobantes de transferencia y capturas de Uber, y razonar ahi sube
 * el costo y la latencia sin mejorar la lectura.
 */
const DEFAULT_VISION_MODEL = 'grok-4.20-0309-non-reasoning';

/**
 * Temperatura del chat con el cliente. Baja a proposito: el prompt de la modelo
 * son casi todo reglas duras (que no prometa besos, que no de horas de llegada,
 * que no confirme el servicio) y con temperaturas altas se las salta mucho mas.
 */
const DEFAULT_CHAT_TEMPERATURE = 0.45;

/**
 * Presupuesto de tokens de la respuesta al cliente.
 *
 * Con un modelo que razona, lo que piensa se descuenta de este mismo tope, asi
 * que un presupuesto ajustado a la respuesta visible se agota razonando y la
 * API devuelve contenido vacio. Aqui eso no se nota como un error: el bot
 * acabaria pasandole el chat al jefe en cada mensaje. El tope deja sitio al
 * razonamiento; que la respuesta sea corta lo gobierna el prompt, no este
 * numero.
 */
const MAX_CHAT_TOKENS = 1500;

/**
 * Razonar tarda mas que responder de corrido, y el cliente ya espero los 20 s
 * del buffer de mensajes. Un corte aqui tambien termina en traspaso al jefe.
 */
const CHAT_TIMEOUT_MS = 60_000;

/**
 * Reintentos ante un 429 o un 5xx del proveedor.
 *
 * Con varios clientes a la vez, un pico de rate limit es lo normal, no una
 * excepcion: antes cada 429 se propagaba como un fallo definitivo y apagaba la
 * IA de esa conversacion. Dos reintentos cubren el pico sin alargar de mas la
 * espera del cliente.
 */
const MAX_CHAT_RETRIES = 2;

/** Un `retry_after` mayor que esto no compensa esperarlo con el cliente delante. */
const MAX_CHAT_RETRY_WAIT_MS = 8_000;

/**
 * Llamadas simultaneas al modelo.
 *
 * Sin tope, cien clientes escribiendo a la vez son cien peticiones en paralelo:
 * el proveedor responde 429 a casi todas y ninguna se salva. Con una cola, las
 * primeras pasan y el resto espera su turno unos segundos.
 */
const DEFAULT_MAX_CONCURRENT_CALLS = 12;

/**
 * Tope de espera en la cola. Rebasarlo se trata como un fallo de la IA, que ya
 * no apaga la conversacion: el cliente recibe una linea en personaje y su
 * siguiente mensaje lo reintenta.
 */
const QUEUE_TIMEOUT_MS = 25_000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * El modelo se lee del entorno para poder cambiarlo o volver al anterior sin
   * desplegar: cuando el proveedor retira una version, el bot se queda mudo.
   */
  private get chatModel(): string {
    return (
      this.configService.get<string>('AI_CHAT_MODEL') || DEFAULT_CHAT_MODEL
    );
  }

  private get visionModel(): string {
    return (
      this.configService.get<string>('AI_VISION_MODEL') || DEFAULT_VISION_MODEL
    );
  }

  private get chatTemperature(): number {
    const raw = this.configService.get<string | number>('AI_CHAT_TEMPERATURE');
    // Ojo con la cadena vacia: `Number('')` es 0, asi que dejar la variable
    // declarada y sin valor en el .env pondria la temperatura a cero —el modelo
    // contestando siempre lo mismo— en vez de usar el valor por defecto.
    if (raw === undefined || raw === null || String(raw).trim() === '') {
      return DEFAULT_CHAT_TEMPERATURE;
    }
    const configured = Number(raw);
    return Number.isFinite(configured) ? configured : DEFAULT_CHAT_TEMPERATURE;
  }

  private getApiKey(): string | undefined {
    return (
      this.configService.get<string>('XAI_API_KEY') ||
      this.configService.get<string>('GROQ_API_KEY') ||
      process.env.XAI_API_KEY ||
      process.env.GROQ_API_KEY
    );
  }

  private get maxConcurrentCalls(): number {
    const raw = this.configService.get<string | number>(
      'AI_MAX_CONCURRENT_CALLS',
    );
    const configured = Number(raw);
    return Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_MAX_CONCURRENT_CALLS;
  }

  /** Llamadas al modelo en vuelo ahora mismo. */
  private enVuelo = 0;
  /** Turnos esperando un hueco, en orden de llegada. */
  private readonly cola: Array<() => void> = [];

  /**
   * Espera un hueco libre para llamar al modelo.
   *
   * Devuelve la funcion con la que se libera el hueco, que hay que invocar
   * siempre —tambien al fallar—, o lanza si la espera se pasa del tope.
   */
  private async tomarTurno(): Promise<() => void> {
    if (this.enVuelo < this.maxConcurrentCalls) {
      this.enVuelo += 1;
      return this.liberarTurno;
    }

    await new Promise<void>((resolve, reject) => {
      const entrada = () => {
        clearTimeout(temporizador);
        this.enVuelo += 1;
        resolve();
      };
      const temporizador = setTimeout(() => {
        const posicion = this.cola.indexOf(entrada);
        if (posicion >= 0) this.cola.splice(posicion, 1);
        reject(
          new Error(
            `La cola de la IA no dio turno en ${QUEUE_TIMEOUT_MS / 1000} s ` +
              `(${this.enVuelo} llamadas en vuelo).`,
          ),
        );
      }, QUEUE_TIMEOUT_MS);
      temporizador.unref?.();
      this.cola.push(entrada);
    });

    return this.liberarTurno;
  }

  private readonly liberarTurno = (): void => {
    this.enVuelo -= 1;
    const siguiente = this.cola.shift();
    siguiente?.();
  };

  async generateChatResponse(
    systemPrompt: string,
    history: { role: string; content: string }[],
  ): Promise<string> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('XAI_API_KEY is not defined in environment variables');
    }

    const messages = [{ role: 'system', content: systemPrompt }, ...history];

    /*
     * Reintento ante lo que es pasajero. Un 429 o un 5xx con varios clientes a
     * la vez es lo esperable, no una averia: antes se propagaba tal cual y el
     * llamador lo trataba como un fallo definitivo de la IA.
     */
    for (let intento = 0; ; intento++) {
      const liberar = await this.tomarTurno();
      let esperaMs: number;
      try {
        return await this.pedirRespuesta(apiKey, messages);
      } catch (err: unknown) {
        const reintentable = readRetryDelayMs(err);
        if (reintentable === null || intento >= MAX_CHAT_RETRIES) throw err;
        if (reintentable > MAX_CHAT_RETRY_WAIT_MS) {
          this.logger.warn(
            `El proveedor pide esperar ${Math.round(reintentable / 1000)} s; ` +
              'es demasiado con el cliente delante y se abandona la llamada.',
          );
          throw err;
        }
        esperaMs = reintentable;
        this.logger.warn(
          `Llamada a la IA reintentable (intento ${intento + 1}/${MAX_CHAT_RETRIES}), ` +
            `se repite en ${Math.round(esperaMs / 1000)} s.`,
        );
      } finally {
        // El hueco se suelta ANTES de dormir: quedarselo durante la espera
        // dejaria la cola parada por una llamada que ni siquiera esta en vuelo.
        liberar();
      }
      await sleep(esperaMs);
    }
  }

  /** Una sola llamada al modelo, sin reintentos ni cola. */
  private async pedirRespuesta(
    apiKey: string,
    messages: { role: string; content: string }[],
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);

    try {
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.chatModel,
          messages,
          max_tokens: MAX_CHAT_TOKENS,
          temperature: this.chatTemperature,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        // El estado y el `retry-after` viajan en el error para que el bucle de
        // reintento sepa si esto se puede repetir y cuanto hay que esperar.
        throw Object.assign(
          new Error(`xAI API error: ${response.status} - ${errorText}`),
          {
            status: response.status,
            retryAfterSeconds: Number(response.headers.get('retry-after')),
          },
        );
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      // Una respuesta vacia no puede devolverse como si fuera valida: el
      // llamador la enviaria a Telegram, el envio fallaria y el chat acabaria
      // en manos del jefe sin dejar claro por que. El motivo habitual es que el
      // modelo agoto el presupuesto razonando, y eso conviene verlo en el log.
      if (!content.trim()) {
        this.logger.error(
          `El modelo ${this.chatModel} devolvio una respuesta vacia ` +
            `(finish_reason: ${data.choices?.[0]?.finish_reason ?? 'desconocido'}).`,
        );
        throw new Error('La IA devolvió una respuesta vacía.');
      }

      return content;
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        this.logger.error(
          `xAI API call timed out after ${CHAT_TIMEOUT_MS / 1000} seconds`,
        );
        throw new Error(
          'La llamada a la API de IA superó el tiempo límite de espera.',
        );
      }
      this.logger.error('Failed to call xAI API:', err.message);
      throw err;
    }
  }

  async analyzeReceipt(imageUrl: string, expectedAmount: number): Promise<any> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('XAI_API_KEY is not defined in environment variables');
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
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.visionModel,
          messages,
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`xAI API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '{}';

      try {
        const parsed = JSON.parse(content);
        return parsed;
      } catch (e) {
        this.logger.error('Failed to parse xAI response as JSON', content);
        return {
          esComprobante: false,
          aiCallFailed: true,
          analisisIA: {
            posibleFraude: true,
            alertas: ['Error al procesar JSON'],
          },
        };
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      this.logger.error('Failed to call xAI Vision API:', err.message);
      return {
        esComprobante: false,
        aiCallFailed: true,
        analisisIA: {
          posibleFraude: true,
          alertas: ['Error de conexión con IA'],
        },
      };
    }
  }
}

/**
 * Cuanto hay que esperar antes de repetir una llamada, o `null` si el error no
 * es de los que se arreglan repitiendo.
 *
 * Se reintenta el 429 (rate limit) y los 5xx del proveedor. Un 400 o un 401 no:
 * repetirlos da exactamente el mismo error y solo retrasa el aviso al cliente.
 */
function readRetryDelayMs(error: unknown): number | null {
  const status = (error as { status?: number } | undefined)?.status;
  if (status !== 429 && !(typeof status === 'number' && status >= 500)) {
    return null;
  }
  const retryAfter = (error as { retryAfterSeconds?: number } | undefined)
    ?.retryAfterSeconds;
  if (Number.isFinite(retryAfter) && (retryAfter as number) > 0) {
    return (retryAfter as number) * 1_000;
  }
  // Sin cabecera, un respiro corto que crece con el intento.
  return status === 429 ? 2_000 : 1_000;
}
