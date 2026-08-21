import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Cifra y descifra los tokens de los bots de Telegram que guardamos en la base
 * de datos. Se usa AES-256-GCM para que el texto cifrado venga autenticado: si
 * alguien altera la fila en la base, el descifrado falla en vez de devolver
 * basura.
 */
@Injectable()
export class TelegramCryptoService {
  private cachedKey: Buffer | null = null;

  constructor(private readonly configService: ConfigService) {}

  /**
   * La clave se resuelve en el primer uso, no al arrancar: sin ella el sistema
   * funciona con normalidad usando el bot central, y solo falla —con un mensaje
   * claro— al intentar vincular el bot dedicado de una modelo.
   */
  private get key(): Buffer {
    if (this.cachedKey) return this.cachedKey;
    const raw = this.configService.get<string>(
      'TELEGRAM_TOKEN_ENCRYPTION_KEY',
      '',
    );
    if (!raw) {
      throw new InternalServerErrorException(
        'Falta TELEGRAM_TOKEN_ENCRYPTION_KEY en el entorno del backend: sin esa clave no se pueden guardar tokens de bots. Generar con: openssl rand -base64 32',
      );
    }
    // Se acepta una clave en base64 de 32 bytes; cualquier otra cosa se
    // normaliza con SHA-256 para no depender del formato exacto que se pegue
    // en el archivo de entorno.
    const decoded = Buffer.from(raw, 'base64');
    this.cachedKey =
      decoded.length === 32
        ? decoded
        : createHash('sha256').update(raw).digest();
    return this.cachedKey;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
  }

  decrypt(payload: string): string {
    const parts = payload.split(':');
    if (parts.length !== 3) {
      throw new InternalServerErrorException(
        'El token almacenado tiene un formato inválido.',
      );
    }
    const [ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
      throw new InternalServerErrorException(
        'El token almacenado tiene un formato inválido.',
      );
    }
    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  /** Últimos 4 caracteres del token, lo único que se expone al panel. */
  hintFor(token: string): string {
    return token.slice(-4);
  }

  newWebhookSecret(): string {
    return randomBytes(24).toString('hex');
  }
}
