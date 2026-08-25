import { ConfigService } from '@nestjs/config';
import { AiProviderService } from './ai-provider.service';

/** Lee el getter privado sin exponerlo: solo interesa el valor resuelto. */
const temperatureOf = (service: AiProviderService): number =>
  (service as unknown as { chatTemperature: number }).chatTemperature;

const modelOf = (service: AiProviderService): string =>
  (service as unknown as { chatModel: string }).chatModel;

describe('AiProviderService — configuración por entorno', () => {
  const build = (values: Record<string, unknown>) =>
    new AiProviderService({
      get: (key: string) => values[key],
    } as unknown as ConfigService);

  it('usa la temperatura por defecto cuando no está configurada', () => {
    expect(temperatureOf(build({}))).toBe(0.45);
  });

  it('trata una variable declarada pero vacía como no configurada', () => {
    // `Number('')` es 0: sin esta comprobación, dejar la línea vacía en el .env
    // dejaba al modelo con temperatura cero, repitiendo siempre lo mismo.
    expect(temperatureOf(build({ AI_CHAT_TEMPERATURE: '' }))).toBe(0.45);
    expect(temperatureOf(build({ AI_CHAT_TEMPERATURE: '   ' }))).toBe(0.45);
  });

  it('respeta la temperatura configurada, incluido el cero explícito', () => {
    expect(temperatureOf(build({ AI_CHAT_TEMPERATURE: '0.2' }))).toBe(0.2);
    expect(temperatureOf(build({ AI_CHAT_TEMPERATURE: 0 }))).toBe(0);
  });

  it('ignora un valor que no es número', () => {
    expect(temperatureOf(build({ AI_CHAT_TEMPERATURE: 'alta' }))).toBe(0.45);
  });

  it('permite cambiar de modelo sin desplegar', () => {
    expect(modelOf(build({}))).toBe('grok-4.3-latest');
    expect(modelOf(build({ AI_CHAT_MODEL: 'grok-9' }))).toBe('grok-9');
  });
});

/** Respuesta de `fetch` con el minimo que lee el servicio. */
function respuesta(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

const respuestaOk = (texto: string) =>
  respuesta(200, { choices: [{ message: { content: texto } }] });

describe('AiProviderService — llamadas bajo carga', () => {
  const build = (values: Record<string, unknown> = {}) =>
    new AiProviderService({
      get: (key: string) => ({ XAI_API_KEY: 'clave', ...values })[key],
    } as unknown as ConfigService);

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  /**
   * El fallo que cubre esta prueba: un 429 se propagaba tal cual y el llamador
   * lo tomaba por una averia definitiva de la IA, con lo que apagaba esa
   * conversacion. Con varios clientes a la vez el rate limit es lo normal.
   */
  it('reintenta un 429 y devuelve la respuesta buena', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch' as never)
      .mockResolvedValueOnce(
        respuesta(
          429,
          { error: 'rate limit' },
          { 'retry-after': '0.01' },
        ) as never,
      )
      .mockResolvedValueOnce(respuestaOk('Hola mor') as never);

    await expect(build().generateChatResponse('sistema', [])).resolves.toBe(
      'Hola mor',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('no reintenta un error que repetir no arregla', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch' as never)
      .mockResolvedValue(respuesta(401, { error: 'sin clave' }) as never);

    await expect(build().generateChatResponse('sistema', [])).rejects.toThrow(
      /401/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('se rinde si el proveedor sigue devolviendo 429', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch' as never)
      .mockResolvedValue(
        respuesta(
          429,
          { error: 'rate limit' },
          { 'retry-after': '0.01' },
        ) as never,
      );

    await expect(build().generateChatResponse('sistema', [])).rejects.toThrow(
      /429/,
    );
    // El intento original mas los dos reintentos, y ni uno mas.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  /**
   * Sin cola, cien clientes escribiendo a la vez son cien peticiones en
   * paralelo y el proveedor las rechaza casi todas.
   */
  it('no deja mas llamadas en vuelo que el tope configurado', async () => {
    let enVuelo = 0;
    let maximo = 0;
    const sueltas: Array<() => void> = [];
    jest.spyOn(global, 'fetch' as never).mockImplementation((() => {
      enVuelo += 1;
      maximo = Math.max(maximo, enVuelo);
      return new Promise((resolve) =>
        sueltas.push(() => {
          enVuelo -= 1;
          resolve(respuestaOk('lista'));
        }),
      );
    }) as never);

    const service = build({ AI_MAX_CONCURRENT_CALLS: 2 });
    const llamadas = Array.from({ length: 5 }, () =>
      service.generateChatResponse('sistema', []),
    );

    // Se van soltando de una en una; el tope no puede rebasarse en ningun paso.
    for (let i = 0; i < llamadas.length; i++) {
      while (!sueltas.length) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      sueltas.shift()!();
      await new Promise((resolve) => setImmediate(resolve));
    }
    await Promise.all(llamadas);

    expect(maximo).toBe(2);
  });
});
