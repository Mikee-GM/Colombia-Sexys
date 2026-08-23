import { Repository } from 'typeorm';
import { TelegramLinkAttempt } from './entities/telegram-link-attempt.entity';
import { TelegramLinkAttemptsService } from './telegram-link-attempts.service';

function fakeRepository() {
  const rows = new Map<string, TelegramLinkAttempt>();
  const repo = {
    rows,
    findOne: ({ where }: { where: { telegramChatId: string } }) =>
      Promise.resolve(rows.get(where.telegramChatId) ?? null),
    upsert: (value: Partial<TelegramLinkAttempt>) => {
      rows.set(
        value.telegramChatId as string,
        {
          ...value,
          updatedAt: new Date(),
        } as TelegramLinkAttempt,
      );
      return Promise.resolve(undefined);
    },
    delete: (criteria: { telegramChatId: string }) => {
      rows.delete(criteria.telegramChatId);
      return Promise.resolve({ affected: 1 });
    },
  };
  return repo as unknown as Repository<TelegramLinkAttempt> & {
    rows: typeof rows;
  };
}

describe('TelegramLinkAttemptsService', () => {
  it('deja intentar mientras queden margen', async () => {
    const repo = fakeRepository();
    const service = new TelegramLinkAttemptsService(repo);

    for (let i = 0; i < 4; i++) {
      expect(await service.registerFailure('chat-1')).toBe(false);
      expect(await service.blockedMinutesLeft('chat-1')).toBeNull();
    }
  });

  it('bloquea el chat al quinto fallo seguido', async () => {
    const repo = fakeRepository();
    const service = new TelegramLinkAttemptsService(repo);

    for (let i = 0; i < 4; i++) await service.registerFailure('chat-1');
    expect(await service.registerFailure('chat-1')).toBe(true);

    const left = await service.blockedMinutesLeft('chat-1');
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThanOrEqual(15);
  });

  it('no mezcla el contador de dos chats distintos', async () => {
    const repo = fakeRepository();
    const service = new TelegramLinkAttemptsService(repo);

    for (let i = 0; i < 4; i++) await service.registerFailure('chat-1');
    expect(await service.registerFailure('chat-2')).toBe(false);
    expect(await service.blockedMinutesLeft('chat-2')).toBeNull();
  });

  it('reinicia el contador si pasó la ventana sin fallos', async () => {
    const repo = fakeRepository();
    const service = new TelegramLinkAttemptsService(repo);

    for (let i = 0; i < 4; i++) await service.registerFailure('chat-1');
    // El último fallo queda fuera de la ventana de quince minutos.
    repo.rows.get('chat-1')!.updatedAt = new Date(Date.now() - 20 * 60_000);

    expect(await service.registerFailure('chat-1')).toBe(false);
    expect(repo.rows.get('chat-1')!.attempts).toBe(1);
  });

  it('olvida los fallos cuando la vinculación sale bien', async () => {
    const repo = fakeRepository();
    const service = new TelegramLinkAttemptsService(repo);

    for (let i = 0; i < 5; i++) await service.registerFailure('chat-1');
    await service.clear('chat-1');

    expect(await service.blockedMinutesLeft('chat-1')).toBeNull();
  });

  it('deja de bloquear cuando vence el plazo', async () => {
    const repo = fakeRepository();
    const service = new TelegramLinkAttemptsService(repo);

    for (let i = 0; i < 5; i++) await service.registerFailure('chat-1');
    repo.rows.get('chat-1')!.blockedUntil = new Date(Date.now() - 1);

    expect(await service.blockedMinutesLeft('chat-1')).toBeNull();
  });
});
