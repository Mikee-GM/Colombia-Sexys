import { ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { Usuarios } from './entities/user.entity';
import { UsersService } from './users.service';

/**
 * `create()` era el hueco de C-1: la ruta no tenia guard y el DTO aceptaba
 * `rol: 'admin'`, asi que cualquiera podia crearse una cuenta de administrador.
 * El guard vive en el controlador; lo que se fija aqui es la otra mitad, que el
 * servicio no deje escalar privilegios ni devuelva el hash.
 */
describe('UsersService.create', () => {
  function build() {
    const saved: Usuarios[] = [];
    const repo = {
      create: jest.fn((data: Partial<Usuarios>) => ({ id: 'u-1', ...data })),
      save: jest.fn((user: Usuarios) => {
        saved.push(user);
        return Promise.resolve(user);
      }),
    } as unknown as Repository<Usuarios>;
    return { service: new UsersService(repo), repo, saved };
  }

  const dto = (rol: Usuarios['rol']) =>
    ({
      email: 'nuevo@ejemplo.com',
      password: 'contraseña-larga',
      rol,
    }) as CreateUserDto;

  const actor = (rol: Usuarios['rol']) => ({ id: 'a-1', rol }) as Usuarios;

  it('deja que un admin cree otro admin', async () => {
    const { service } = build();
    await expect(
      service.create(dto('admin'), actor('admin')),
    ).resolves.toBeDefined();
  });

  it('impide que un jefe se cree una cuenta admin', async () => {
    const { service } = build();
    await expect(service.create(dto('admin'), actor('jefe'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('impide crear un admin sin actor identificado', async () => {
    const { service } = build();
    await expect(service.create(dto('admin'))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('permite a un jefe crear roles que no son admin', async () => {
    const { service } = build();
    await expect(
      service.create(dto('empleada'), actor('jefe')),
    ).resolves.toBeDefined();
  });

  it('nunca devuelve el hash de la contraseña', async () => {
    const { service } = build();
    const created = await service.create(dto('empleada'), actor('admin'));
    expect(created).not.toHaveProperty('passwordHash');
  });

  it('guarda la contraseña hasheada, nunca en claro', async () => {
    const { service, saved } = build();
    await service.create(dto('empleada'), actor('admin'));
    expect(saved[0].passwordHash).toBeDefined();
    expect(saved[0].passwordHash).not.toBe('contraseña-larga');
    expect(saved[0]).not.toHaveProperty('password');
  });
});
