import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TelegramConversationPhotoService } from './telegram-conversation-photo.service';
import type { Usuarios } from '../users/entities/user.entity';
import type { ConversacionesTelegram } from './entities/telegram-conversation.entity';

const actor = { id: 'boss', rol: 'jefe' } as unknown as Usuarios;
const messageId = '11111111-1111-4111-8111-111111111111';
const message = {
  id: messageId,
  attachment: { type: 'photo' },
  photoFileId: 'private-file-id',
} as unknown as ConversacionesTelegram;

function setup(token = '123456789:valid_token') {
  const query = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(message),
  };
  const repository = { createQueryBuilder: jest.fn(() => query) };
  const history = {
    assertMessageReadAccess: jest.fn().mockResolvedValue(undefined),
  };
  const callApi = jest.fn().mockResolvedValue({ file_path: 'photos/file.jpg' });
  const bot = { telegram: { callApi } };
  const config = { get: jest.fn().mockReturnValue(token) };
  const service = new TelegramConversationPhotoService(
    repository as never,
    history as never,
    bot as never,
    config as never,
  );
  return { service, history, callApi };
}

describe('TelegramConversationPhotoService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('authorizes the exact message and proxies only a verified Telegram image', async () => {
    const { service, history, callApi } = setup();
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    global.fetch = jest.fn().mockResolvedValue(
      new Response(png, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    );

    await expect(service.readPhoto(message.id, actor)).resolves.toEqual({
      buffer: png,
      contentType: 'image/png',
    });
    expect(history.assertMessageReadAccess).toHaveBeenCalledWith(
      message,
      actor,
    );
    expect(callApi).toHaveBeenCalledWith(
      'getFile',
      { file_id: 'private-file-id' },
      expect.objectContaining({ signal: expect.anything() }),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/file/bot123456789:valid_token/photos/file.jpg',
      expect.objectContaining({ redirect: 'error', signal: expect.anything() }),
    );
  });

  it('does not contact Telegram in dummy mode', async () => {
    const { service, callApi } = setup('123:dummy-token');
    global.fetch = jest.fn();

    await expect(service.readPhoto(message.id, actor)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(callApi).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('does not contact Telegram when ownership authorization fails', async () => {
    const { service, history, callApi } = setup();
    history.assertMessageReadAccess.mockRejectedValueOnce(
      new ForbiddenException('denied'),
    );
    global.fetch = jest.fn();

    await expect(service.readPhoto(message.id, actor)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(callApi).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects provider paths before download and hides provider details', async () => {
    const { service, callApi } = setup();
    callApi.mockRejectedValueOnce(
      new Error(
        'secret https://api.telegram.org/file/bot123456789:valid_token',
      ),
    );
    global.fetch = jest.fn();

    const error = await service
      .readPhoto(message.id, actor)
      .catch((reason) => reason);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    expect(String(error.message)).not.toMatch(/valid_token/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('aborts a stalled Bot API lookup before attempting a download', async () => {
    jest.useFakeTimers();
    try {
      const { service, callApi } = setup();
      callApi.mockImplementationOnce(
        (_method, _payload, options: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () =>
              reject(new Error('aborted provider request')),
            );
          }),
      );
      global.fetch = jest.fn();
      const pending = service.readPhoto(message.id, actor);
      const rejection = expect(pending).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await jest.advanceTimersByTimeAsync(10_000);

      await rejection;
      expect(global.fetch).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
