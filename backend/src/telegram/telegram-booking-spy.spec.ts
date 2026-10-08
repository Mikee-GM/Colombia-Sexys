import { TelegramBookingUpdate } from './telegram-booking.update';

describe('TelegramBookingUpdate: spy administrativo', () => {
  it('maneja rechazos de Telegram sin interrumpir la respuesta del cliente', async () => {
    const update = Object.create(
      TelegramBookingUpdate.prototype,
    ) as TelegramBookingUpdate;
    const sut = update as unknown as Record<string, any>;
    const sendMessage = jest
      .fn()
      .mockRejectedValue(new Error("400: can't parse entities"));
    const sendPhoto = jest
      .fn()
      .mockRejectedValue(new Error("400: can't parse entities"));
    const logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() };
    const reply = jest.fn().mockResolvedValue(undefined);
    const ctx: any = {
      chat: { type: 'private', id: 77 },
      from: { id: 77, first_name: 'Test_Name' },
      message: {
        text: 'hola _ mundo * prueba',
        photo: [{ file_id: 'photo-1' }],
      },
      session: {
        step: 'AWAITING_DURATION',
        iaActiva: true,
      },
      reply,
    };

    sut.manualServiceWizard = {
      manejarTexto: jest.fn().mockResolvedValue(false),
    };
    sut.teamChannelUpdate = {
      manejarTexto: jest.fn().mockResolvedValue(false),
    };
    sut.clienteBloqueado = jest.fn().mockResolvedValue(false);
    sut.usuariosRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    sut.configService = {
      get: jest.fn((key: string) =>
        key === 'ADMIN_SPY_CHAT_ID' ? 'spy-chat' : undefined,
      ),
    };
    sut.bot = { telegram: { sendMessage, sendPhoto } };
    sut.logger = logger;
    sut.groupServicesService = {
      findActiveRequestByClientTelegram: jest.fn().mockResolvedValue(null),
    };
    sut.serviciosRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    sut.routeGlobalBookingIntent = jest.fn().mockResolvedValue(false);

    await expect(
      update.onMessage(
        ctx as Parameters<TelegramBookingUpdate['onMessage']>[0],
        jest.fn(),
      ),
    ).resolves.toBeUndefined();
    await Promise.resolve();

    expect(reply).toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(
      'spy-chat',
      expect.stringContaining('Test_Name'),
      expect.objectContaining({ disable_notification: true }),
    );
    const spyCall = sendMessage.mock.calls[0] as unknown[];
    const spyOptions = spyCall[2] as Record<string, unknown>;
    expect(spyOptions).not.toHaveProperty('parse_mode');
    expect(sendPhoto).toHaveBeenCalledWith('spy-chat', 'photo-1', {
      caption: '📷 Foto de Test_Name · 77',
    });
    expect(logger.warn).toHaveBeenCalledTimes(2);
  });
});
