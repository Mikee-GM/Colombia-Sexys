import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class UploadService {
  private s3Client: S3Client;
  private bucketName: string;
  private privateBucketName: string;
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
    this.privateBucketName = this.configService.get<string>(
      'R2_PRIVATE_BUCKET_NAME',
      this.bucketName,
    );
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

  async uploadPrivateFile(
    file: any,
    folder = 'comprobantes',
  ): Promise<{ key: string; bucket: string }> {
    try {
      const timestamp = Date.now();
      const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const key = `${folder}/${timestamp}-${sanitizedName}`;

      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.privateBucketName,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );

      return { key, bucket: this.privateBucketName };
    } catch (error) {
      console.error('Error uploading private file to R2:', error);
      throw new InternalServerErrorException(
        'Error al subir el archivo privado a R2',
      );
    }
  }

  async getPresignedUrl(
    key: string,
    expiresInSeconds = 3600,
  ): Promise<{ url: string }> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.privateBucketName,
        Key: key,
      });
      const url = await getSignedUrl(this.s3Client as any, command, {
        expiresIn: expiresInSeconds,
      });
      return { url };
    } catch (error) {
      console.error('Error generating presigned URL for R2:', error);
      throw new InternalServerErrorException(
        'Error al generar URL temporal para el archivo privado',
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
      console.error('Error deleting file from R2:', error);
      throw new InternalServerErrorException(
        'Error al eliminar el archivo de R2',
      );
    }
  }

  async deletePrivateFile(key: string): Promise<{ success: boolean }> {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.privateBucketName,
          Key: key,
        }),
      );

      return { success: true };
    } catch (error) {
      console.error('Error deleting private file from R2:', error);
      throw new InternalServerErrorException(
        'Error al eliminar el archivo privado de R2',
      );
    }
  }
}
