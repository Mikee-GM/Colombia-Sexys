import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectBot } from 'nestjs-telegraf';
import { Context, Telegraf } from 'telegraf';
import { Repository } from 'typeorm';
import { Usuarios } from '../users/entities/user.entity';
import { isDummyTelegramToken } from '../telegram/telegram-transport';
import { ConversacionesTelegram } from './entities/telegram-conversation.entity';
import { TelegramConversationsService } from './telegram-conversations.service';

export const CONVERSATION_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 10_000;

function imageType(buffer: Buffer): string | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  )
    return 'image/jpeg';
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png';
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp';
  return null;
}

@Injectable()
export class TelegramConversationPhotoService {
  constructor(
    @InjectRepository(ConversacionesTelegram)
    private readonly conversations: Repository<ConversacionesTelegram>,
    private readonly history: TelegramConversationsService,
    @InjectBot() private readonly bot: Telegraf<Context>,
    private readonly config: ConfigService,
  ) {}

  async readPhoto(
    id: string,
    actor: Usuarios,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const message = await this.conversations
      .createQueryBuilder('message')
      .addSelect('message.photoFileId')
      .where('message.id = :id', { id })
      .getOne();
    if (
      !message ||
      message.attachment?.type !== 'photo' ||
      !message.photoFileId
    ) {
      throw new NotFoundException('Foto no disponible');
    }
    await this.history.assertMessageReadAccess(message, actor);

    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (
      !token ||
      isDummyTelegramToken(token) ||
      !/^\d+:[A-Za-z0-9_-]+$/.test(token)
    ) {
      throw new ServiceUnavailableException('Canal de imágenes no disponible');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    try {
      const file = await this.bot.telegram.callApi(
        'getFile',
        { file_id: message.photoFileId },
        // Telegraf still types this with its abort-controller polyfill; at
        // runtime it accepts the standards-compatible Node signal.
        { signal: controller.signal as never },
      );
      // Never proxy a caller URL or trust an absolute/encoded provider path.
      if (
        !file.file_path ||
        !/^[A-Za-z0-9_/-]+\.(?:jpe?g|png|webp)$/i.test(file.file_path) ||
        file.file_path.startsWith('/') ||
        file.file_path.split('/').includes('..')
      ) {
        throw new Error('Invalid image path');
      }
      if (file.file_size && file.file_size > CONVERSATION_PHOTO_MAX_BYTES) {
        throw new Error('Image too large');
      }
      const response = await fetch(
        `https://api.telegram.org/file/bot${token}/${file.file_path}`,
        {
          redirect: 'error',
          signal: controller.signal,
        },
      );
      if (
        !response.ok ||
        !response.body ||
        Number(response.headers.get('content-length')) >
          CONVERSATION_PHOTO_MAX_BYTES
      ) {
        await response.body?.cancel();
        throw new Error('Image unavailable');
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > CONVERSATION_PHOTO_MAX_BYTES) {
            await reader.cancel();
            throw new Error('Image too large');
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const buffer = Buffer.concat(chunks);
      const contentType = imageType(buffer);
      if (!contentType) throw new Error('Unsupported image');
      return { buffer, contentType };
    } catch {
      // Provider errors can contain the tokenized URL. Never return/log them.
      throw new ServiceUnavailableException(
        'La foto no está disponible temporalmente',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
