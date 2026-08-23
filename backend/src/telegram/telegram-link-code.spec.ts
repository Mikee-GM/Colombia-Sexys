import { generateLinkCode, hashLinkCode } from './telegram-link-code';

describe('código de vinculación', () => {
  it('siempre tiene seis dígitos, incluidos los que empiezan por cero', () => {
    for (let i = 0; i < 500; i++) {
      expect(generateLinkCode()).toMatch(/^\d{6}$/);
    }
  });

  it('cubre el rango completo, no solo de 100000 en adelante', () => {
    // La versión anterior hacía `100000 + random * 900000`, así que nunca
    // generaba un código con cero delante y perdía el 10 % del espacio.
    const codes = new Set<string>();
    for (let i = 0; i < 20000; i++) codes.add(generateLinkCode());
    expect([...codes].some((c) => c.startsWith('0'))).toBe(true);
  });

  it('la huella es estable e ignora los espacios de alrededor', () => {
    expect(hashLinkCode('012345')).toBe(hashLinkCode(' 012345 '));
  });

  it('códigos distintos dan huellas distintas', () => {
    expect(hashLinkCode('000001')).not.toBe(hashLinkCode('000002'));
  });

  it('la huella no contiene el código', () => {
    expect(hashLinkCode('123456')).not.toContain('123456');
    expect(hashLinkCode('123456')).toMatch(/^[0-9a-f]{64}$/);
  });
});
