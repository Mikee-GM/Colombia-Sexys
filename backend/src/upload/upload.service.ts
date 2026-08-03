import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

@Injectable()
export class UploadService {
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

  async uploadFile(file: any): Promise<{ url: string }> {
    try {
      const timestamp = Date.now();
      const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const key = `modelos/${timestamp}-${sanitizedName}`;

      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );

      return { url: `${this.publicUrl}/${key}` };
    } catch (error) {
      console.error('Error uploading file to R2:', error);
      throw new InternalServerErrorException('Error al subir el archivo a R2');
    }
  }

  async uploadEvidence(input: {
    buffer: Buffer;
    contentType: string;
    folder: 'uber' | 'transferencias';
    scopeId?: string;
  }): Promise<{ url: string; key: string }> {
    const contentType = input.contentType.split(';')[0].trim().toLowerCase();
    const extension = IMAGE_EXTENSIONS[contentType];
    if (!extension) {
      throw new InternalServerErrorException(
        'La evidencia recibida no tiene un formato de imagen compatible',
      );
    }
    if (!input.buffer.length || input.buffer.length > EVIDENCE_MAX_BYTES) {
      throw new InternalServerErrorException(
        'La evidencia recibida está vacía o supera el límite permitido',
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
      console.error('Error uploading evidence to R2:', error);
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
    let response: Response;
    try {
      response = await fetch(input.sourceUrl);
    } catch (error) {
      console.error('Error downloading evidence:', error);
      throw new InternalServerErrorException(
        'No fue posible descargar la evidencia recibida',
      );
    }
    if (!response.ok) {
      throw new InternalServerErrorException(
        'No fue posible descargar la evidencia recibida',
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
      console.error('Error deleting file from R2:', error);
      throw new InternalServerErrorException(
        'Error al eliminar el archivo de R2',
      );
    }
  }
}
