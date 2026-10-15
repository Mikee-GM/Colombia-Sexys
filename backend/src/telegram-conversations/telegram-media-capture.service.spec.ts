import { TelegramMediaCaptureService } from './telegram-media-capture.service';

function setup() {
  const conversations = {
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((value) => value),
    save: jest.fn((value) =>
      Promise.resolve({ ...value, photoFileId: value.photoFileId }),
    ),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const clients = { findOne: jest.fn().mockResolvedValue({ id: 'client' }) };
  const users = { findOne: jest.fn().mockResolvedValue(null) };
  const services = { findOne: jest.fn(), find: jest.fn() };
  const employees = {
    findOne: jest.fn().mockResolvedValue({
      id: 'employee',
      jefeId: 'boss',
      jefeSecundarioId: null,
    }),
  };
  const drafts = {
    findOne: jest.fn().mockResolvedValue({
      id: 'session',
      clientId: 'client',
      intendedEmployeeId: 'employee',
      serviceId: null,
    }),
  };
  const realtime = { emitToBosses: jest.fn() };
  const service = new TelegramMediaCaptureService(
    conversations as never,
    clients as never,
    users as never,
    services as never,
    employees as never,
    drafts as never,
    realtime as never,
  );
  return { service, conversations, realtime };
}

describe('TelegramMediaCaptureService', () => {
  it('captures a private customer photo after the normal handler without changing its session', async () => {
    const { service, conversations, realtime } = setup();
    const order: string[] = [];
    conversations.save.mockImplementationOnce((value) => {
      order.push('capture');
      return Promise.resolve({ ...value, photoFileId: value.photoFileId });
    });
    const session = {
      bookingSessionId: 'session',
      empleadaId: 'employee',
      step: 'AWAITING_DURATION',
    };
    const ctx = {
      chat: { id: 123, type: 'private' },
      from: { id: 123 },
      session,
      message: {
        message_id: 77,
        date: 1_760_000_000,
        chat: { id: 123, type: 'private' },
        photo: [
          {
            file_id: 'private-id',
            file_unique_id: 'u',
            width: 640,
            height: 480,
          },
        ],
        caption: 'Referencia',
      },
    };

    await service.middleware()(ctx as never, () => {
      order.push('handler');
      expect(ctx.session).toBe(session);
      return Promise.resolve();
    });

    expect(order).toEqual(['handler', 'capture']);
    expect(ctx.session).toBe(session);
    expect(conversations.save).toHaveBeenCalledWith(
      expect.objectContaining({
        clienteId: 'client',
        bookingSessionId: 'session',
        telegramMessageId: '77',
        attachment: expect.objectContaining({ type: 'photo' }),
        photoFileId: 'private-id',
      }),
    );
    expect(realtime.emitToBosses).toHaveBeenCalledWith(
      ['boss'],
      expect.objectContaining({
        type: 'chat_message',
        data: expect.not.objectContaining({ photoFileId: expect.anything() }),
      }),
    );
  });

  it('updates an existing location idempotently instead of duplicating it', async () => {
    const { service, conversations, realtime } = setup();
    conversations.findOne.mockResolvedValueOnce({
      id: 'existing',
      clienteId: 'client',
      bookingSessionId: 'session',
      servicioId: null,
      intendedEmployeeId: 'employee',
      intendedEmployee: {
        id: 'employee',
        jefeId: 'boss',
        jefeSecundarioId: null,
      },
      servicio: null,
    });
    const ctx = {
      chat: { id: 123, type: 'private' },
      from: { id: 123 },
      session: { bookingSessionId: 'session', empleadaId: 'employee' },
      editedMessage: {
        message_id: 88,
        date: 1_760_000_000,
        chat: { id: 123, type: 'private' },
        location: { latitude: 20.58, longitude: -100.38 },
      },
    };

    await service.middleware()(ctx as never, () => Promise.resolve());

    expect(conversations.update).toHaveBeenCalledWith('existing', {
      attachment: expect.objectContaining({ type: 'location' }),
      photoFileId: null,
    });
    expect(conversations.save).not.toHaveBeenCalled();
    expect(realtime.emitToBosses).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ type: 'chat_message_updated' }),
    );
  });

  it('ignores staff, groups and unknown clients', async () => {
    const { service, conversations } = setup();
    const next = jest.fn().mockResolvedValue(undefined);
    const base = {
      from: { id: 123 },
      message: {
        message_id: 1,
        date: 1,
        chat: { id: 123, type: 'private' },
        location: { latitude: 20, longitude: -100 },
      },
    };

    await service.middleware()(
      { ...base, chat: { id: -1, type: 'group' } } as never,
      next,
    );
    expect(conversations.save).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
