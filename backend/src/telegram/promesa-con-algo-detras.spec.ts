import { TelegramBookingUpdate } from './telegram-booking.update';

/**
 * Distinguir la promesa cierta de la hueca.
 *
 * "Te aviso en un ratico" es legitimo si detras hay de verdad alguien de quien
 * va a llegar una respuesta --el jefe con una peticion de trio, una modelo
 * ocupada, un comprobante en revision--. Si no hay nada de eso, ese aviso no lo
 * va a dar nadie y la conversacion esta muerta aunque parezca viva.
 *
 * Lo que se protege aqui es que no se cuele nada por ninguno de los dos lados:
 * cortar una conversacion que si tenia algo en marcha es tan malo como dejar
 * morir la que no.
 */
describe('TelegramBookingUpdate: si la promesa tiene algo detras', () => {
  const update = Object.create(TelegramBookingUpdate.prototype) as unknown as {
    hayAlgoEnMarcha(session: Record<string, unknown>): boolean;
  };

  it('una conversacion recien empezada no tiene nada en marcha', () => {
    expect(update.hayAlgoEnMarcha({ step: 'CHAT_CON_EMPLEADA' })).toBe(false);
  });

  /* Justo el caso que destapo esto: pedir un trio y que nadie se entere. */
  it('tampoco la tiene si se hablo de un trio pero no se trasladó', () => {
    expect(
      update.hayAlgoEnMarcha({
        step: 'CHAT_CON_EMPLEADA',
        trioSelectedEmployeeName: 'Isabella',
      }),
    ).toBe(false);
  });

  const enMarcha: Array<[string, Record<string, unknown>]> = [
    ['el trio ya está con el jefe', { trioStatus: 'pending_boss' }],
    ['espera a una modelo ocupada', { esperandoEmpleadaId: 'emp-1' }],
    [
      'hay un comprobante pendiente',
      { servicioPendienteComprobanteId: 'srv-1' },
    ],
    ['hay un cobro final abierto', { servicioCobroFinalId: 'srv-2' }],
    ['hay un servicio grupal pedido', { groupRequestId: 'grp-1' }],
    ['ya contesta una persona', { humanTakeover: true }],
  ];

  it.each(enMarcha)('sí la tiene cuando %s', (_caso, session) => {
    expect(update.hayAlgoEnMarcha(session)).toBe(true);
  });
});
