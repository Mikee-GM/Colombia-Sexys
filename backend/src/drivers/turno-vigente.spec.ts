import {
  momentoDeTurno,
  sqlTurnoVigente,
  sqlTurnoVigenteNumerado,
} from './turno-vigente';

/**
 * La condición de turno es la menos evidente de las nueve que decidien si un
 * chofer entra al reparto, y la que más confunde: uno SIN turnos asignados
 * entra siempre, pero en cuanto se le asigna uno solo entra dentro de su
 * ventana. Asignarle un turno lo hace menos disponible.
 *
 * Vive en un solo sitio porque el reparto y el diagnóstico de "no hay choferes
 * disponibles" tienen que aplicar exactamente la misma: con dos copias, el
 * diagnóstico acabaría mintiendo sobre lo que hace el reparto.
 */
describe('El momento del turno, en hora de México', () => {
  /** 9 de septiembre de 2026, 20:47 UTC = 14:47 en Ciudad de México. */
  const tarde = new Date('2026-09-09T20:47:00Z');

  it('da la hora local del negocio, no la del servidor', () => {
    expect(momentoDeTurno(tarde).currentTime).toBe('14:47');
  });

  it('da el día de la semana como lo guarda days_of_week', () => {
    // Ese 9 de septiembre de 2026 es miércoles: 3 con domingo = 0.
    expect(momentoDeTurno(tarde).currentDow).toBe(3);
    expect(momentoDeTurno(tarde).yesterdayDow).toBe(2);
  });

  /**
   * El turno de noche se pregunta contra el día de ayer, así que el día
   * anterior al domingo tiene que ser el sábado y no un -1.
   */
  it('el día de ayer da la vuelta en domingo', () => {
    // 13 de septiembre de 2026, domingo, a las 06:00 de México.
    const domingo = new Date('2026-09-13T12:00:00Z');
    expect(momentoDeTurno(domingo).currentDow).toBe(0);
    expect(momentoDeTurno(domingo).yesterdayDow).toBe(6);
  });

  it('la medianoche sale como 00, no como 24', () => {
    // 10 de septiembre de 2026, 00:30 en México.
    const medianoche = new Date('2026-09-10T06:30:00Z');
    expect(momentoDeTurno(medianoche).currentTime).toBe('00:30');
  });
});

describe('El SQL de la condición de turno', () => {
  it('deja pasar al chofer que no tiene ningún turno asignado', () => {
    // Es la mitad que mantiene funcionando a quien no usa turnos.
    expect(sqlTurnoVigente('chofer')).toContain(
      'NOT EXISTS (SELECT 1 FROM driver_shift_assignments',
    );
  });

  it('contempla los turnos que cruzan la medianoche', () => {
    const sql = sqlTurnoVigente('chofer');
    expect(sql).toContain('ds.starts_at > ds.ends_at');
    expect(sql).toContain(':yesterdayDow');
  });

  it('usa el alias que se le pide', () => {
    expect(sqlTurnoVigente('c')).toContain('dsa.driver_id = c.id');
    expect(sqlTurnoVigente('chofer')).toContain('dsa.driver_id = chofer.id');
  });

  /** La consulta suelta no entiende `:nombre`, solo `$1`. */
  it('traduce los marcadores para dataSource.query', () => {
    const sql = sqlTurnoVigenteNumerado('c', {
      currentTime: 1,
      currentDow: 2,
      yesterdayDow: 3,
    });
    expect(sql).not.toContain(':current');
    expect(sql).not.toContain(':yesterday');
    expect(sql).toContain('$1');
    expect(sql).toContain('$2');
    expect(sql).toContain('$3');
  });

  /**
   * El reparto y el diagnóstico se diferencian solo en el alias y en la forma
   * de los marcadores: si alguna vez dejan de coincidir en lo demás, el
   * diagnóstico estaría explicando una condición que no es la que se aplica.
   */
  it('es la misma condición en las dos formas', () => {
    const delReparto = sqlTurnoVigente('c')
      .replace(/:currentTime/g, '$1')
      .replace(/:currentDow/g, '$2')
      .replace(/:yesterdayDow/g, '$3');
    expect(
      sqlTurnoVigenteNumerado('c', {
        currentTime: 1,
        currentDow: 2,
        yesterdayDow: 3,
      }),
    ).toBe(delReparto);
  });
});
