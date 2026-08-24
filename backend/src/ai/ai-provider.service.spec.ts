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
