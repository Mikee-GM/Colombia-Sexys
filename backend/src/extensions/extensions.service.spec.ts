import { ConflictException } from '@nestjs/common';
import { ExtensionsService } from './extensions.service';
import { Prorrogas } from './entities/extension.entity';

describe('ExtensionsService', () => {
  it('records an extension and increments the counter atomically', async () => {
    const serviceRecord: any = { id: 'service-1', estado: 'en_curso', prorrogasUsadas: 1 };
    const manager = {
      findOne: jest.fn().mockResolvedValue(serviceRecord),
      save: jest.fn().mockImplementation((_entity: any, value?: any) => Promise.resolve(value || _entity)),
    };
    const dataSource = { transaction: (callback: any) => callback(manager) } as any;

    const result = await new ExtensionsService(dataSource).requestServiceExtension('service-1');

    expect(result.extensionNumber).toBe(2);
    expect(serviceRecord.prorrogasUsadas).toBe(2);
    expect(manager.save).toHaveBeenCalledWith(
      Prorrogas,
      expect.objectContaining({ numeroProrroga: 2, minutosSolicitados: 10 }),
    );
  });

  it('rejects a fourth extension', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({ id: 'service-1', estado: 'en_curso', prorrogasUsadas: 3 }),
    };
    const dataSource = { transaction: (callback: any) => callback(manager) } as any;
    await expect(
      new ExtensionsService(dataSource).requestServiceExtension('service-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
