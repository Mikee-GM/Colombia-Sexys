import { TelegramAdminUpdate } from './telegram-admin.update';

describe('TelegramAdminUpdate: cierre de Uber de regreso', () => {
  type Ctx = {
    from: { id: number };
    session: { pendingUberFare: number };
    match: string[];
    answerCbQuery: jest.Mock;
    editMessageText: jest.Mock;
  };

  function montar(estado: string) {
    const update = Object.create(TelegramAdminUpdate.prototype) as any;
    update.callbackGuard = { esRepetido: jest.fn().mockResolvedValue(false) };
    update.usuariosRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'boss' }),
    };
    update.servicesService = {
      confirmUberFare: jest.fn().mockResolvedValue({
        id: 'trip',
        tipo: 'regreso',
        estado,
      }),
    };

    const ctx: Ctx = {
      from: { id: 123 },
      session: { pendingUberFare: 150 },
      match: ['uber_fare_confirm:trip', 'trip'],
      answerCbQuery: jest.fn().mockResolvedValue(undefined),
      editMessageText: jest.fn().mockResolvedValue(undefined),
    };

    return { update, ctx };
  }

  async function confirmar(estado: string) {
    const { update, ctx } = montar(estado);
    await update.onUberFareConfirm(ctx);
    return ctx.editMessageText.mock.calls[0][1]?.reply_markup
      ?.inline_keyboard?.[0]?.[0];
  }

  it('ofrece marcar en camino cuando el viaje sigue aceptado', async () => {
    const button = await confirmar('aceptado');

    expect(button).toEqual(
      expect.objectContaining({
        text: '🚗 Uber va en camino (por ella)',
        callback_data: 'jefe_uber_estado:trip:en_camino',
      }),
    );
  });

  it('ofrece marcar llegada cuando el viaje ya está en camino', async () => {
    const button = await confirmar('en_camino');

    expect(button).toEqual(
      expect.objectContaining({
        text: '📍 Uber llegó (por ella)',
        callback_data: 'jefe_uber_estado:trip:llegado',
      }),
    );
  });

  it.each([
    ['llegado', '🚶‍♀️ Ya subió (por ella)', 'eu:trip:i'],
    ['en_curso', '📍 Ya llegó a su destino', 'eu:trip:f'],
  ])(
    'ofrece la siguiente acción cuando el viaje está en estado %s',
    async (estado, text, callbackData) => {
      const button = await confirmar(estado);

      expect(button).toEqual(
        expect.objectContaining({
          text,
          callback_data: callbackData,
        }),
      );
    },
  );

  it('no ofrece una acción de estado cuando el viaje ya finalizó', async () => {
    const { update, ctx } = montar('finalizado');
    await update.onUberFareConfirm(ctx);

    expect(ctx.editMessageText).toHaveBeenCalledWith(
      'Costo del Uber registrado y liquidación actualizada.',
      undefined,
    );
  });
});
