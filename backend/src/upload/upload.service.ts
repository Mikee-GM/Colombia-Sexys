import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { describeError } from '../common/errors/error-message';

const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Lo unico que el servicio necesita del fichero que entrega Multer. Se declara
 * aqui para no depender de @types/multer, que el proyecto no instala.
 */
export type UploadedFilePayload = {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
};

/** Tope de las subidas del panel. Se aplica tambien en el FileInterceptor. */
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Unicos hosts desde los que se descarga evidencia. `uploadEvidenceFromUrl`
 * hace una peticion saliente desde el backend, asi que sin lista blanca seria
 * un SSRF hacia la red interna o al endpoint de metadatos del proveedor.
 */
const EVIDENCE_SOURCE_HOSTS = new Set(['api.telegram.org']);

/** Timeout de la descarga de evidencia, para no colgar el handler. */
const EVIDENCE_FETCH_TIMEOUT_MS = 15_000;
const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function sniffImageContentType(buffer: Buffer): string | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private s3Client: S3Client;
  private bucketName: string;
  private publicUrl: string;

  constructor(private configService: ConfigService) {
    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: this.configService.getOrThrow<string>('R2_ENDPOINT'),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('R2_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow<string>(
          'R2_SECRET_ACCESS_KEY',
        ),
      },
    });
    this.bucketName = this.configService.getOrThrow<string>('R2_BUCKET_NAME');
    this.publicUrl = this.configService.getOrThrow<string>('R2_PUBLIC_URL');
  }

  /**
   * El bucket es publico, asi que el `Content-Type` no puede venir del cliente:
   * subir un HTML declarado como `text/html` daria XSS almacenado bajo el
   * dominio de confianza. Se deduce del contenido real del fichero y se rechaza
   * lo que no sea una imagen conocida.
   */
  async uploadFile(file: UploadedFilePayload): Promise<{ url: string }> {
    const contentType = this.assertImage(file);
    const extension = IMAGE_EXTENSIONS[contentType];
    const key = `modelos/${Date.now()}-${randomUUID()}.${extension}`;

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: file.buffer,
          ContentType: contentType,
        }),
      );

      return { url: `${this.publicUrl}/${key}` };
    } catch (error) {
      this.logger.error(`Error subiendo archivo a R2: ${describeError(error)}`);
      throw new InternalServerErrorException('Error al subir el archivo a R2');
    }
  }

  /**
   * Valida tamaño y formato real. Se mira el contenido con `sniffImageContentType`
   * y solo se acepta el mimetype declarado si coincide con lo que dicen los
   * bytes; asi un `.png` renombrado o un HTML disfrazado se rechazan igual.
   */
  private assertImage(file: UploadedFilePayload): string {
    if (!file.buffer?.length) {
      throw new BadRequestException('El archivo recibido está vacío');
    }
    if (file.buffer.length > UPLOAD_MAX_BYTES) {
      throw new BadRequestException(
        `El archivo supera el límite de ${Math.floor(UPLOAD_MAX_BYTES / (1024 * 1024))} MB`,
      );
    }
    const sniffed = sniffImageContentType(file.buffer);
    if (!sniffed) {
      throw new BadRequestException(
        'Solo se aceptan imágenes JPEG, PNG o WEBP',
      );
    }
    return sniffed;
  }

  async uploadEvidence(input: {
    buffer: Buffer;
    contentType: string;
    folder: 'uber' | 'transferencias';
    scopeId?: string;
  }): Promise<{ url: string; key: string }> {
    if (!input.buffer.length || input.buffer.length > EVIDENCE_MAX_BYTES) {
      throw new BadRequestException(
        'La evidencia recibida está vacía o supera el límite permitido',
      );
    }

    let contentType = input.contentType.split(';')[0].trim().toLowerCase();
    let extension = IMAGE_EXTENSIONS[contentType];
    if (!extension) {
      const sniffed = sniffImageContentType(input.buffer);
      if (sniffed) {
        contentType = sniffed;
        extension = IMAGE_EXTENSIONS[sniffed];
      }
    }
    if (!extension) {
      throw new BadRequestException(
        'La evidencia recibida no tiene un formato de imagen compatible',
      );
    }

    const scope = input.scopeId ? `/${input.scopeId}` : '';
    const key = `evidencias/${input.folder}${scope}/${randomUUID()}.${extension}`;
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: input.buffer,
          ContentType: contentType,
        }),
      );
      return { key, url: `${this.publicUrl}/${key}` };
    } catch (error) {
      this.logger.error(
        `Error subiendo evidencia a R2: ${describeError(error)}`,
      );
      throw new InternalServerErrorException(
        'No fue posible almacenar la evidencia en la nube',
      );
    }
  }

  async uploadEvidenceFromUrl(input: {
    sourceUrl: string;
    folder: 'uber' | 'transferencias';
    scopeId?: string;
  }): Promise<{ url: string; key: string }> {
    this.assertAllowedSource(input.sourceUrl);

    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      EVIDENCE_FETCH_TIMEOUT_MS,
    );
    try {
      response = await fetch(input.sourceUrl, { signal: controller.signal });
    } catch (error) {
      this.logger.error(`Error descargando evidencia: ${describeError(error)}`);
      throw new InternalServerErrorException(
        'No fue posible descargar la evidencia recibida',
      );
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      throw new InternalServerErrorException(
        'No fue posible descargar la evidencia recibida',
      );
    }

    // El Content-Length puede mentir o faltar, asi que el tope real lo impone
    // uploadEvidence sobre el buffer ya materializado; esto solo corta pronto
    // lo que ya se anuncia como demasiado grande.
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > EVIDENCE_MAX_BYTES) {
      throw new BadRequestException(
        'La evidencia recibida supera el límite permitido',
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return this.uploadEvidence({
      buffer,
      contentType: response.headers.get('content-type') ?? '',
      folder: input.folder,
      scopeId: input.scopeId,
    });
  }

  /**
   * Solo se descarga de los hosts de la lista blanca y siempre por https. Sin
   * esto, cualquier ruta que llegue a alimentar `sourceUrl` convierte al
   * backend en un proxy hacia su propia red interna.
   */
  private assertAllowedSource(sourceUrl: string): void {
    let parsed: URL;
    try {
      parsed = new URL(sourceUrl);
    } catch {
      throw new BadRequestException('El origen de la evidencia no es válido');
    }
    if (parsed.protocol !== 'https:') {
      throw new BadRequestException(
        'El origen de la evidencia debe usar https',
      );
    }
    if (!EVIDENCE_SOURCE_HOSTS.has(parsed.hostname)) {
      throw new BadRequestException(
        'El origen de la evidencia no está autorizado',
      );
    }
  }

  async deleteFile(url: string): Promise<{ success: boolean }> {
    try {
      if (!url.startsWith(this.publicUrl)) {
        return { success: false };
      }
      const key = url.replace(`${this.publicUrl}/`, '');

      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );

      return { success: true };
    } catch (error) {
      this.logger.error(
        `Error eliminando archivo de R2: ${describeError(error)}`,
      );
      throw new InternalServerErrorException(
        'Error al eliminar el archivo de R2',
      );
    }
  }
}
