import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { Usuarios } from './entities/user.entity';

@Injectable()
export class UserSeederService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UserSeederService.name);

  constructor(
    @InjectRepository(Usuarios)
    private readonly usuariosRepository: Repository<Usuarios>,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    await this.seedAdminUser();
  }

  private async seedAdminUser() {
    const adminEmail =
      this.configService.get<string>('DEFAULT_ADMIN_EMAIL') ||
      'admin@chambapasteles.com';
    const adminPassword =
      this.configService.get<string>('DEFAULT_ADMIN_PASSWORD') || 'admin12345';

    // Verify if an admin user already exists
    const adminExists = await this.usuariosRepository.findOne({
      where: { rol: 'admin' },
    });

    if (adminExists) {
      this.logger.log(
        'El usuario administrador ya existe en la base de datos. Prueba jeje',
      );
      return;
    }

    // Verify if the email is already in use by another user
    const emailExists = await this.usuariosRepository.findOne({
      where: { email: adminEmail },
    });

    if (emailExists) {
      this.logger.warn(
        `No se pudo crear el administrador por defecto porque el email ${adminEmail} ya está en uso.`,
      );
      return;
    }

    try {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(adminPassword, salt);

      const adminUser = this.usuariosRepository.create({
        email: adminEmail,
        passwordHash,
        rol: 'admin',
        activo: true,
      });

      await this.usuariosRepository.save(adminUser);
      this.logger.log(
        `Usuario administrador creado con éxito (${adminEmail}).`,
      );
    } catch (error) {
      this.logger.error(
        'Error al crear el usuario administrador por defecto:',
        error,
      );
    }
  }
}
