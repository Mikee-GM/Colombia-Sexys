import { assertSafeQaSeedTarget } from './sembrar-operacion-qa';

describe('seed local de operaciones QA', () => {
  const safe = {
    nodeEnv: 'development',
    confirmation: 'CONFIRM_LOCAL_QA',
    host: '127.0.0.1',
    database: 'colombia_sexys_qa',
  };

  it('acepta únicamente un destino local identificado como QA', () => {
    expect(() => assertSafeQaSeedTarget(safe)).not.toThrow();
  });

  it('rechaza producción aunque se suministre la confirmación', () => {
    expect(() =>
      assertSafeQaSeedTarget({ ...safe, nodeEnv: 'production' }),
    ).toThrow('NODE_ENV=production');
  });

  it.each([
    [{ ...safe, confirmation: undefined }, 'QA_LOCAL_SEED'],
    [{ ...safe, host: 'db.example.com' }, 'solo admite PostgreSQL local'],
    [{ ...safe, database: 'colombia_sexys' }, 'debe identificarla'],
  ])('rechaza un destino inseguro', (input, message) => {
    expect(() => assertSafeQaSeedTarget(input)).toThrow(message);
  });
});
