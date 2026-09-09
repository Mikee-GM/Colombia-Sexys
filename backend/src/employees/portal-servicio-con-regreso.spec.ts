import { EmployeesService } from './employees.service';
import type { Servicios } from '../services/entities/service.entity';

/**
 * El fallo que cubre este spec.
 *
 * La tarjeta del portal solo miraba los tres estados de trabajo --en curso,
 * agendado y pendiente--, así que en cuanto la modelo finalizaba el servicio
 * desaparecía de su pantalla, y con ella los botones del traslado. Se quedaba
 * sin forma de marcar que ya iba en el Uber de vuelta ni que había llegado a su
 * casa, que es justo cuando esos dos avisos importan. El servicio no está
 * cerrado de verdad hasta que ese viaje termina.
 */
type Privados = {
  regresoPendiente(servicio: Servicios): { id: string } | null;
};

const instancia = () =>
  Object.create(EmployeesService.prototype) as unknown as Privados;

const servicioCon = (
  viajes: { id: string; tipo: string; estado: string }[],
): Servicios => ({ viajes }) as unknown as Servicios;

describe('El servicio finalizado que aún tiene regreso', () => {
  it('reconoce el regreso que sigue abierto', () => {
    const servicio = servicioCon([
      { id: 'ida', tipo: 'ida', estado: 'finalizado' },
      { id: 'vuelta', tipo: 'regreso', estado: 'aceptado' },
    ]);

    expect(instancia().regresoPendiente(servicio)?.id).toBe('vuelta');
  });

  it('lo reconoce en cualquiera de los estados intermedios', () => {
    for (const estado of [
      'notificado',
      'aceptado',
      'en_camino',
      'llegado',
      'en_curso',
    ]) {
      const servicio = servicioCon([{ id: 'v', tipo: 'regreso', estado }]);
      expect(instancia().regresoPendiente(servicio)).not.toBeNull();
    }
  });

  /** Terminado, rechazado o cancelado ya no dejan nada por pulsar. */
  it('no lo reconoce cuando el regreso ya terminó o se cayó', () => {
    for (const estado of ['finalizado', 'rechazado', 'cancelado']) {
      const servicio = servicioCon([{ id: 'v', tipo: 'regreso', estado }]);
      expect(instancia().regresoPendiente(servicio)).toBeNull();
    }
  });

  it('no confunde la ida con el regreso', () => {
    const servicio = servicioCon([
      { id: 'ida', tipo: 'ida', estado: 'en_curso' },
    ]);

    expect(instancia().regresoPendiente(servicio)).toBeNull();
  });

  it('aguanta un servicio sin viajes', () => {
    expect(instancia().regresoPendiente(servicioCon([]))).toBeNull();
    expect(instancia().regresoPendiente({} as unknown as Servicios)).toBeNull();
  });
});
