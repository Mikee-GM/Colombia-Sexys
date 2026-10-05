import {
  availableServiceOperationActions,
  nextServiceOperationState,
  operationStateFromLegacy,
} from './service-operation-state';

describe('máquina de estados operativa del servicio', () => {
  it.each([
    ['preparacion', 'preparar', 'preparado'],
    ['preparado', 'asignar', 'asignado'],
    [
      'asignado',
      'solicitar_aceptacion_empleada',
      'esperando_aceptacion_empleada',
    ],
    ['esperando_aceptacion_empleada', 'aceptar_empleada', 'aceptado'],
    ['aceptado', 'esperar_transporte_ida', 'esperando_transporte_ida'],
    [
      'esperando_transporte_ida',
      'asignar_transporte_ida',
      'transporte_ida_asignado',
    ],
    ['transporte_ida_asignado', 'empleada_sale', 'empleada_en_camino'],
    ['empleada_en_camino', 'empleada_llega', 'empleada_llego'],
    ['empleada_llego', 'iniciar_servicio', 'en_curso'],
    ['en_curso', 'preparar_regreso', 'preparando_regreso'],
    [
      'preparando_regreso',
      'asignar_transporte_regreso',
      'transporte_regreso_asignado',
    ],
    ['transporte_regreso_asignado', 'empleada_regresa', 'empleada_de_regreso'],
    ['empleada_de_regreso', 'finalizar', 'finalizado'],
  ] as const)('%s + %s -> %s', (from, action, to) => {
    expect(nextServiceOperationState(from, action)).toBe(to);
  });

  it('rechaza saltarse transporte, llegada e inicio', () => {
    expect(
      nextServiceOperationState('aceptado', 'iniciar_servicio'),
    ).toBeNull();
    expect(
      nextServiceOperationState('transporte_ida_asignado', 'empleada_llega'),
    ).toBeNull();
    expect(
      nextServiceOperationState('empleada_llega', 'preparar_regreso'),
    ).toBeNull();
  });

  it('solo muestra acciones que corresponden al estado actual', () => {
    expect(availableServiceOperationActions('empleada_llego')).toEqual([
      'iniciar_servicio',
      'cancelar',
    ]);
    expect(availableServiceOperationActions('finalizado')).toEqual([]);
  });

  it('conserva una interpretación compatible para filas históricas', () => {
    expect(operationStateFromLegacy({ estado: 'pendiente' })).toBe(
      'preparacion',
    );
    expect(operationStateFromLegacy({ estado: 'agendado' })).toBe('asignado');
    expect(operationStateFromLegacy({ estado: 'en_curso' })).toBe('en_curso');
    expect(operationStateFromLegacy({ estado: 'finalizado' })).toBe(
      'preparando_regreso',
    );
    expect(
      operationStateFromLegacy({
        estado: 'finalizado',
        horaLlegadaCasa: new Date(),
      }),
    ).toBe('finalizado');
  });
});
