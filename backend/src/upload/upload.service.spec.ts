import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { UploadService } from './upload.service';

jest.mock('@aws-sdk/client-s3', () => {
  const actual = jest.requireActual('@aws-sdk/client-s3');
  return {
    ...actual,
    S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
  };
});

describe('UploadService evidence storage', () => {
  const send = jest.fn().mockResolvedValue({});
  const values: Record<string, string> = {
    R2_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
    R2_ACCESS_KEY_ID: 'access',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_BUCKET_NAME: 'bucket',
    R2_PRIVATE_BUCKET_NAME: 'private-bucket',
    R2_PUBLIC_URL: 'https://media.example.com',
  };
  const config = {
    get: jest.fn(
      (key: string, defaultValue?: string) => values[key] ?? defaultValue,
    ),
    getOrThrow: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    (S3Client as unknown as jest.Mock).mockImplementation(() => ({ send }));
  });

  it('usa una ruta UUID y conserva el MIME de la evidencia', async () => {
    const service = new UploadService(config);
    const result = await service.uploadEvidence({
      buffer: Buffer.from('image'),
      contentType: 'image/jpeg',
      folder: 'uber',
      scopeId: 'trip-id',
    });

    expect(result.key).toMatch(
      /^evidencias\/uber\/trip-id\/[0-9a-f-]{36}\.jpg$/,
    );
    expect(result.url).toBe(`https://media.example.com/${result.key}`);
    const command = send.mock.calls[0][0] as PutObjectCommand;
    expect(command.input).toEqual(
      expect.objectContaining({
        Bucket: 'bucket',
        Key: result.key,
        ContentType: 'image/jpeg',
      }),
    );
  });

  it('rechaza contenido que no sea una imagen compatible', async () => {
    const service = new UploadService(config);
    await expect(
      service.uploadEvidence({
        buffer: Buffer.from('document'),
        contentType: 'application/pdf',
        folder: 'transferencias',
      }),
    ).rejects.toThrow('formato de imagen compatible');
    expect(send).not.toHaveBeenCalled();
  });
});
