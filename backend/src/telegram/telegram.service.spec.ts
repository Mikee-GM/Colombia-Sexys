import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getBotToken } from 'nestjs-telegraf';
import { Test, TestingModule } from '@nestjs/testing';
import { Servicios } from '../services/entities/service.entity';
import { Usuarios } from '../users/entities/user.entity';
import { TelegramService } from './telegram.service';
import { Context, Telegraf } from 'telegraf';

describe('TelegramService', () => {
  let service: TelegramService;
  let bot: Telegraf<Context>;
  let externalCall: jest.Mock;

  beforeEach(async () => {
    bot = new Telegraf<Context>('123456789:dummy-unit-test');
    externalCall = jest
      .spyOn(bot.telegram, 'callApi')
      .mockResolvedValue({ ok: true } as never);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramService,
        {
          provide: getBotToken(),
          useValue: bot,
        },
        {
          provide: getRepositoryToken(Usuarios),
          useValue: { find: jest.fn(), findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(Servicios),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: unknown) =>
              key === 'TELEGRAM_BOT_TOKEN'
                ? '123456789:dummy-unit-test'
                : fallback,
            ),
          },
        },
      ],
    }).compile();

    service = module.get<TelegramService>(TelegramService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('arranca y permite efectos de negocio sin red en modo dummy', async () => {
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    await expect(
      service.sendMessage('42', 'Mensaje QA'),
    ).resolves.toMatchObject({
      chat: { id: 42 },
      text: 'Mensaje QA',
    });

    expect(externalCall).not.toHaveBeenCalled();
  });
});
