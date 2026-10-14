import { IsNull } from 'typeorm';
import { ServicesService } from './services.service';
import { Servicios } from './entities/service.entity';
import { Usuarios } from '../users/entities/user.entity';

describe('ServicesService administrative listing pagination', () => {
  const find = jest.fn();
  const service = Object.create(ServicesService.prototype) as ServicesService;
  Object.assign(service, { serviciosRepository: { find } });

  beforeEach(() => {
    jest.resetAllMocks();
    find.mockResolvedValue([]);
  });

  it('preserves the array contract and bounded default page size', async () => {
    const rows = [{ id: 'record-1' }] as Servicios[];
    find.mockResolvedValue(rows);

    await expect(service.findAll()).resolves.toBe(rows);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: IsNull() },
        take: 200,
        skip: 0,
        relationLoadStrategy: 'query',
        order: { createdAt: 'DESC', id: 'DESC' },
      }),
    );
  });

  it('accepts subsequent pages and caps requests at 500', async () => {
    await service.findAll(undefined, { limit: 1000, offset: 500 });

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ take: 500, skip: 500 }),
    );
  });

  it('normalizes fractional and negative pagination values', async () => {
    await service.findAll(undefined, { limit: 12.9, offset: -1 });

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ take: 12, skip: 0 }),
    );
  });

  it('preserves assigned-person scope on every page', async () => {
    const actor = { id: 'boss-1', rol: 'jefe' } as Usuarios;
    await service.findAll(actor, { limit: 500, offset: 500 });

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: [
          { jefeId: actor.id, deletedAt: IsNull() },
          { empleada: { jefeId: actor.id }, deletedAt: IsNull() },
          { empleada: { jefeSecundarioId: actor.id }, deletedAt: IsNull() },
        ],
        take: 500,
        skip: 500,
        order: { createdAt: 'DESC', id: 'DESC' },
      }),
    );
  });
});
