import { AddEsGenericoToExtrasCatalogo1797000000000 } from './1797000000000-AddEsGenericoToExtrasCatalogo';

describe('AddEsGenericoToExtrasCatalogo migration', () => {
  const sqlDe = (query: jest.Mock) =>
    query.mock.calls.map(([statement]) => statement).join('\n');

  it('agrega la columna de forma idempotente y con valor por defecto', async () => {
    const query = jest.fn();

    await new AddEsGenericoToExtrasCatalogo1797000000000().up({
      query,
    } as never);

    const sql = sqlDe(query);
    expect(sql).toContain('ALTER TABLE "extras_catalogo"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "es_generico"');
    // Sin NOT NULL DEFAULT, las filas existentes quedarian en NULL y el filtro
    // `esGenerico: false` dejaria de encontrar el catalogo entero.
    expect(sql).toContain('boolean NOT NULL DEFAULT false');
  });

  /**
   * Los comodines que ya existen se reconocen por el nombre exacto, que es el
   * mismo criterio con el que el codigo los busca hoy.
   */
  it('marca los comodines que ya existían', async () => {
    const query = jest.fn();

    await new AddEsGenericoToExtrasCatalogo1797000000000().up({
      query,
    } as never);

    const sql = sqlDe(query);
    expect(sql).toContain('UPDATE "extras_catalogo"');
    expect(sql).toContain(`"nombre" = 'Extra'`);
  });

  it('quita la columna en el rollback', async () => {
    const query = jest.fn();

    await new AddEsGenericoToExtrasCatalogo1797000000000().down({
      query,
    } as never);

    expect(sqlDe(query)).toContain('DROP COLUMN IF EXISTS "es_generico"');
  });
});
