import { ConflictException } from '@nestjs/common';
import { TelegramConversationsService } from './telegram-conversations.service';

describe('TelegramConversationsService', () => {
  const conversations = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: 'message-1', ...value })),
    find: jest.fn(),
  };
  const services = { findOne: jest.fn() };
  const bot = { telegram: { sendMessage: jest.fn() } };
  const realtime = { emitToBoss: jest.fn(), emitToBosses: jest.fn() };
  const subject = new TelegramConversationsService(
    conversations as any,
    services as any,
    bot as any,
    realtime as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('envía, persiste y emite un mensaje del jefe asignado', async () => {
    services.findOne.mockResolvedValue({
      id: 'service-1',
      clienteId: 'client-1',
      clienteTelegramId: '123',
      jefeId: 'boss-1',
      iaActiva: false,
      empleada: {},
      jefe: { grupoTelegramId: '456' },
      telegramThreadId: '10',
    });

    const result = await subject.sendBossMessage(
      'service-1',
      { id: 'boss-1', rol: 'jefe' } as any,
      ' Buenas tardes ',
    );

    expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
      '123',
      'Buenas tardes',
    );
    expect(conversations.save).toHaveBeenCalled();
    expect(realtime.emitToBosses).toHaveBeenCalledWith(
      ['boss-1', undefined, undefined],
      expect.objectContaining({ type: 'chat_message' }),
    );
    expect(result.mensaje).toBe('Buenas tardes');
  });

  it('impide que otro jefe lea la conversación', async () => {
    services.findOne.mockResolvedValue({
      id: 'service-1',
      jefeId: 'boss-1',
      empleada: { jefeId: 'boss-1' },
    });

    await expect(
      subject.findByService(
        'service-1',
        { id: 'boss-2', rol: 'jefe' } as any,
        undefined,
        50,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
