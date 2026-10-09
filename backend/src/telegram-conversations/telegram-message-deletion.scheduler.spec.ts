import { TelegramMessageDeletionScheduler } from './telegram-message-deletion.scheduler';

describe('TelegramMessageDeletionScheduler', () => {
  const now = new Date('2026-10-09T12:00:00.000Z');

  function setup(rows: any[]) {
    const conversations = {
      find: jest.fn().mockResolvedValue(rows),
      save: jest.fn((row) => Promise.resolve(row)),
    };
    const runner = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest
        .fn()
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ pg_advisory_unlock: true }]),
      manager: { getRepository: jest.fn(() => conversations) },
      release: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = { createQueryRunner: jest.fn(() => runner) };
    const deleteMessage = jest.fn().mockResolvedValue(true);
    const scheduler = new TelegramMessageDeletionScheduler(
      dataSource as any,
      { telegram: { deleteMessage } } as any,
    );
    return { scheduler, conversations, deleteMessage, runner };
  }

  it('borra únicamente los ids persistidos que vencieron y conserva la fila', async () => {
    const oldBookingMessage = {
      id: 'old-message',
      bookingSessionId: 'booking-old',
      servicioId: 'service-old',
      telegramChatId: '1001',
      telegramMessageId: '501',
      deleteAt: new Date('2026-10-09T11:59:00.000Z'),
      deleteStatus: 'PENDING',
      deleteAttempts: 0,
      lastDeleteError: null,
      deletedFromTelegramAt: null,
    };
    const { scheduler, conversations, deleteMessage, runner } = setup([
      oldBookingMessage,
    ]);

    await expect(scheduler.runOnce(now)).resolves.toBe(1);

    expect(deleteMessage).toHaveBeenCalledTimes(1);
    expect(deleteMessage).toHaveBeenCalledWith('1001', 501);
    expect(runner.query.mock.calls[1][0]).toContain(
      'conversation."booking_session_id" = service."booking_session_id"',
    );
    expect(conversations.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'old-message',
        bookingSessionId: 'booking-old',
        deleteStatus: 'DELETED',
        deletedFromTelegramAt: now,
      }),
    );
    expect(runner.release).toHaveBeenCalledTimes(1);
  });

  it('mantiene el historial y deja un fallo transitorio listo para reintento', async () => {
    const row = {
      id: 'retry-message',
      telegramChatId: '1001',
      telegramMessageId: '502',
      deleteAt: new Date('2026-10-09T11:59:00.000Z'),
      deleteStatus: 'PENDING',
      deleteAttempts: 0,
      lastDeleteError: null,
      deletedFromTelegramAt: null,
      mensaje: 'El historial se conserva',
    };
    const { scheduler, conversations, deleteMessage } = setup([row]);
    deleteMessage.mockRejectedValueOnce(new Error('ETIMEDOUT'));

    await expect(scheduler.runOnce(now)).resolves.toBe(1);

    expect(conversations.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'retry-message',
        mensaje: 'El historial se conserva',
        deleteStatus: 'FAILED_RETRYABLE',
        deleteAttempts: 1,
      }),
    );
  });

  it('expira reintentos después de 48 horas desde el cierre', async () => {
    const row = {
      id: 'expired-message',
      telegramChatId: '1001',
      telegramMessageId: '503',
      deleteAt: new Date('2026-10-08T11:59:59.000Z'),
      deleteStatus: 'FAILED_RETRYABLE',
      deleteAttempts: 3,
      lastDeleteError: 'Telegram temporalmente no disponible',
      deletedFromTelegramAt: null,
    };
    const { scheduler, conversations, deleteMessage } = setup([row]);

    await scheduler.runOnce(now);

    expect(deleteMessage).not.toHaveBeenCalled();
    expect(conversations.save).toHaveBeenCalledWith(
      expect.objectContaining({ deleteStatus: 'EXPIRED' }),
    );
  });
});
