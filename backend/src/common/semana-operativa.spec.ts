import { lunesDeLaSemana, mismaSemanaOperativa } from './locale';

/**
 * "La semana" tiene que significar lo mismo en toda la casa.
 *
 * Los portales la resolvian como "los ultimos siete dias": un lunes, la
 * ganancia "de la semana" del chofer incluia la semana anterior entera, ya
 * liquidada y cobrada, y no cuadraba con la hoja que tenia la oficina delante.
 * Y el rango del panel se calculaba en UTC, asi que la semana empezaba a las
 * seis de la tarde del domingo hora de aqui.
 */
describe('Semana operativa', () => {
  /* Domingo 20:00 en Mexico son las 02:00 del lunes en UTC. */
  const domingoPorLaNoche = new Date('2026-09-14T02:00:00Z');
  const lunesDeMadrugada = new Date('2026-09-14T06:30:00Z');

  it('el domingo por la noche sigue siendo la semana que acaba', () => {
    expect(lunesDeLaSemana(domingoPorLaNoche)).toBe('2026-09-07');
  });

  it('la semana nueva empieza a medianoche hora de México', () => {
    expect(lunesDeLaSemana(lunesDeMadrugada)).toBe('2026-09-14');
  });

  it('esas dos fechas no caen en la misma semana', () => {
    expect(mismaSemanaOperativa(domingoPorLaNoche, lunesDeMadrugada)).toBe(
      false,
    );
  });

  /*
   * Lo que rompia el calculo de "ultimos siete dias": el martes anterior esta a
   * menos de siete dias de un lunes, pero es de la semana pasada.
   */
  it('el martes anterior no es de la misma semana que el lunes siguiente', () => {
    const martesPasado = new Date('2026-09-08T18:00:00Z');
    expect(mismaSemanaOperativa(martesPasado, lunesDeMadrugada)).toBe(false);
  });

  it('dos dias de la misma semana si coinciden', () => {
    const miercoles = new Date('2026-09-16T18:00:00Z');
    const viernes = new Date('2026-09-18T18:00:00Z');
    expect(mismaSemanaOperativa(miercoles, viernes)).toBe(true);
  });
});
