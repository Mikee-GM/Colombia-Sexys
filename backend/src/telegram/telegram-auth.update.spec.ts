import { TelegramAuthUpdate } from './telegram-auth.update';

describe('TelegramAuthUpdate deep links', () => {
  function setup(options?: { user?: any; client?: any }) {
    const usuariosRepository = {
      findOne: jest.fn().mockResolvedValue(options?.user ?? null),
    };
    const createdClient =
      options?.client ?? {
        id: 'client-id',
        telegramChatId: '123',
        nombreTelegram: 'Cliente',
      };
    const clientesRepository = {
      findOne: jest.fn().mockResolvedValue(options?.client ?? null),
      create: jest.fn().mockReturnValue(createdClient),
      save: jest.fn().mockResolvedValue(createdClient),
    };
    const bookingUpdate = {
      startDirectGroupSession: jest.fn().mockResolvedValue(undefined),
      startHireSession: jest.fn().mockResolvedValue(undefined),
    };
    const update = new TelegramAuthUpdate(
      usuariosRepository as any,
      clientesRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      bookingUpdate as any,
      {} as any,
      {} as any,
    );
    const ctx = {
      from: { id: 123, first_name: 'Nuevo', last_name: 'Cliente' },
      message: { text: '/start servicio_grupal' },
      reply: jest.fn().mockResolvedValue(undefined),
    };
    return {
      update,
      ctx,
      bookingUpdate,
      clientesRepository,
    };
  }

  it('registra al cliente nuevo e inicia directamente el flujo grupal', async () => {
    const { update, ctx, bookingUpdate, clientesRepository } = setup();
    await update.onStart(ctx as any);

    expect(clientesRepository.save).toHaveBeenCalled();
    expect(bookingUpdate.startDirectGroupSession).toHaveBeenCalledWith(ctx);
    expect(bookingUpdate.startHireSession).not.toHaveBeenCalled();
  });

  it('reutiliza un cliente existente para el flujo grupal', async () => {
    const client = {
      id: 'existing-client',
      telegramChatId: '123',
      nombreTelegram: 'Existente',
    };
    const { update, ctx, bookingUpdate, clientesRepository } = setup({
      client,
    });
    await update.onStart(ctx as any);

    expect(clientesRepository.save).not.toHaveBeenCalled();
    expect(bookingUpdate.startDirectGroupSession).toHaveBeenCalledWith(ctx);
  });

  it('no crea solicitudes grupales para cuentas internas', async () => {
    const { update, ctx, bookingUpdate } = setup({
      user: {
        id: 'admin-id',
        email: 'admin@example.com',
        rol: 'admin',
      },
    });
    await update.onStart(ctx as any);

    expect(bookingUpdate.startDirectGroupSession).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('ADMIN'),
      expect.any(Object),
    );
  });

  it('mantiene el acceso individual existente', async () => {
    const { update, ctx, bookingUpdate } = setup({
      client: {
        id: 'client-id',
        telegramChatId: '123',
        nombreTelegram: 'Cliente',
      },
    });
    ctx.message.text = '/start contratar_employee-id';
    await update.onStart(ctx as any);

    expect(bookingUpdate.startHireSession).toHaveBeenCalledWith(
      ctx,
      'employee-id',
    );
    expect(bookingUpdate.startDirectGroupSession).not.toHaveBeenCalled();
  });
});
