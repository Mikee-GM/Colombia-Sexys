import { puedeAtender } from './services.service';

/**
 * `disponible` y `enJornada` responden preguntas distintas y las dos tienen que
 * cumplirse. Mirar solo la primera hacia que a alguien que ya cerro su dia le
 * siguieran cayendo servicios.
 */
describe('puedeAtender', () => {
  it('acepta a quien esta libre y dentro de su jornada', () => {
    expect(puedeAtender({ disponible: true, enJornada: true })).toBe(true);
  });

  it('descarta a quien esta ocupado', () => {
    expect(puedeAtender({ disponible: false, enJornada: true })).toBe(false);
  });

  it('descarta a quien cerro su jornada aunque figure libre', () => {
    expect(puedeAtender({ disponible: true, enJornada: false })).toBe(false);
  });

  /*
   * Los registros anteriores a la migracion pueden llegar sin el campo. Se
   * asume que siguen trabajando: lo contrario dejaria la operacion parada de
   * golpe al desplegar.
   */
  it('da por buena a quien no tiene el dato cargado', () => {
    expect(puedeAtender({ disponible: true })).toBe(true);
    expect(puedeAtender({})).toBe(true);
  });
});
