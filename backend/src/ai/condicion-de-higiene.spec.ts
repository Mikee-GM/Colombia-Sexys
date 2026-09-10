import { faltaCondicionDeHigiene } from './ai-guardrails';

/**
 * La condicion que acompaña siempre a un extra.
 *
 * El prompt la pide en tres sitios distintos y aun asi el modelo se la saltaba
 * al recitar la lista de extras con sus precios. Es lo que evita la discusion
 * en el motel --el cliente llega creyendo que el extra estaba pactado-- asi que
 * no puede depender de que se acuerde.
 */
describe('La condición de higiene al nombrar un extra', () => {
  const extras = ['Oral sin condon', 'Trio', 'Beso negro'];

  it('la echa en falta cuando cotiza un extra sin decirla', () => {
    expect(
      faltaCondicionDeHigiene(
        'El oral sin condon son $1500 aparte, mor.',
        extras,
      ),
    ).toBe(true);
  });

  it('no la echa en falta si ya la dijo', () => {
    expect(
      faltaCondicionDeHigiene(
        'El oral sin condon son $1500, eso si con buena higiene.',
        extras,
      ),
    ).toBe(false);
  });

  /** El acento no puede decidir si el aviso sale o no. */
  it('reconoce la condición aunque venga con acentos', () => {
    expect(
      faltaCondicionDeHigiene(
        'El trio va aparte, siempre que llegues bien bañadito.',
        extras,
      ),
    ).toBe(false);
  });

  it('no dice nada cuando no se nombró ningún extra', () => {
    expect(
      faltaCondicionDeHigiene(
        'Uy que rico, dime cuantas horitas quieres.',
        extras,
      ),
    ).toBe(false);
  });

  /** Solo los extras de esa modelo: lo que no está en su lista no cuenta. */
  it('ignora extras que no son de su catálogo', () => {
    expect(faltaCondicionDeHigiene('Eso del masaje no lo hago.', extras)).toBe(
      false,
    );
  });

  it('aguanta un mensaje vacío y un catálogo vacío', () => {
    expect(faltaCondicionDeHigiene('', extras)).toBe(false);
    expect(faltaCondicionDeHigiene('El trio son $2000.', [])).toBe(false);
  });
});
