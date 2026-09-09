import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateManualServiceRequestDto } from './dto/create-manual-service-request.dto';

/**
 * Las horas de una solicitud manual, ahora que la modelo puede escribirlas.
 *
 * El formulario del portal solo ofrecía una lista cerrada de botones --1, 2, 3,
 * 4, 6, 8 y 12--, así que quien cuadraba cinco horas, o una hora y media, tenía
 * que conformarse con el botón más cercano y el importe salía mal. Con el campo
 * libre entra lo que ella teclee, y estos límites son lo que impide que un cero,
 * un negativo o un dedazo creen un servicio con un importe absurdo que el jefe
 * tendría que cazar a ojo.
 */
const base = {
  tipo: 'inmediato',
  fechaServicio: new Date().toISOString(),
  metodoPago: 'efectivo',
  montoCobrado: 2500,
  motivo: 'Cliente conocido del barrio',
};

async function erroresDe(duracionHoras: unknown): Promise<string[]> {
  const dto = plainToInstance(CreateManualServiceRequestDto, {
    ...base,
    duracionHoras,
  });
  const errores = await validate(dto);
  return errores
    .filter((error) => error.property === 'duracionHoras')
    .flatMap((error) => Object.keys(error.constraints ?? {}));
}

describe('Horas de una solicitud de servicio manual', () => {
  it('acepta las horas sueltas que antes no cabían en los botones', async () => {
    expect(await erroresDe(5)).toEqual([]);
    expect(await erroresDe(7)).toEqual([]);
    expect(await erroresDe(11)).toEqual([]);
  });

  it('acepta las medias horas', async () => {
    expect(await erroresDe(1.5)).toEqual([]);
    expect(await erroresDe(0.5)).toEqual([]);
    expect(await erroresDe(2.25)).toEqual([]);
  });

  it('acepta el día entero', async () => {
    expect(await erroresDe(24)).toEqual([]);
  });

  it('rechaza el cero y los negativos', async () => {
    expect(await erroresDe(0)).not.toEqual([]);
    expect(await erroresDe(-3)).not.toEqual([]);
  });

  it('rechaza más de un día', async () => {
    expect(await erroresDe(25)).not.toEqual([]);
    expect(await erroresDe(500)).not.toEqual([]);
  });

  /** La columna es `numeric(4,2)`: más decimales se perderían al guardar. */
  it('rechaza más de dos decimales', async () => {
    expect(await erroresDe(1.234)).not.toEqual([]);
  });

  it('rechaza lo que no es un número', async () => {
    expect(await erroresDe('cinco')).not.toEqual([]);
  });
});
