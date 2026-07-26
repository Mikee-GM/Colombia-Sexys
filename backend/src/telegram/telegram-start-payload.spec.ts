import { parseTelegramStartPayload } from './telegram-start-payload';

describe('parseTelegramStartPayload', () => {
  it('reconoce exclusivamente el acceso grupal acordado', () => {
    expect(parseTelegramStartPayload('/start servicio_grupal')).toEqual({
      type: 'group_service',
    });
    expect(parseTelegramStartPayload('/start servicio_grupal_otro')).toEqual({
      type: 'unknown',
    });
  });

  it('conserva los enlaces individuales existentes', () => {
    expect(parseTelegramStartPayload('/start contratar_employee-id')).toEqual({
      type: 'employee_hire',
      employeeId: 'employee-id',
    });
    expect(
      parseTelegramStartPayload('/start contratar_empleada_employee-id'),
    ).toEqual({
      type: 'employee_hire',
      employeeId: 'employee-id',
    });
  });

  it('ignora comandos sin payload o payloads desconocidos', () => {
    expect(parseTelegramStartPayload('/start')).toEqual({ type: 'unknown' });
    expect(parseTelegramStartPayload('/start cualquier_cosa')).toEqual({
      type: 'unknown',
    });
  });
});
