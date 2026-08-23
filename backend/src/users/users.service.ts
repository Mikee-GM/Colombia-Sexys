import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Usuarios } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { generateLinkCode, hashLinkCode } from '../telegram/telegram-link-code';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(Usuarios)
    private readonly usuariosRepository: Repository<Usuarios>,
  ) {}

  async generateTelegramOtp(userId: string) {
    const user = await this.usuariosRepository.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    const code = generateLinkCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos de validez

    // En la base solo queda la huella. El codigo en claro se devuelve una vez,
    // para que el panel se lo enseñe a quien lo pidio, y no se guarda en ningun
    // sitio del que se pueda recuperar despues.
    user.telegramVerificationCode = hashLinkCode(code);
    user.telegramVerificationExpiresAt = expiresAt;
    await this.usuariosRepository.save(user);

    return {
      code,
      expiresAt,
    };
  }

  async unlinkTelegram(userId: string) {
    const user = await this.usuariosRepository.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    user.telegramChatId = null;
    user.telegramVerificationCode = null;
    user.telegramVerificationExpiresAt = null;

    await this.usuariosRepository.save(user);

    return { unlinked: true };
  }

  /**
   * Solo un admin puede crear otro admin. Sin esta comprobacion cualquier jefe
   * podria escalar privilegios creandose una cuenta con rol 'admin'.
   */
  async create(createUserDto: CreateUserDto, actor?: Usuarios) {
    if (createUserDto.rol === 'admin' && actor?.rol !== 'admin') {
      throw new ForbiddenException(
        'Solo un administrador puede crear cuentas con rol admin',
      );
    }

    const { password, ...rest } = createUserDto;
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const user = this.usuariosRepository.create({
      ...rest,
      passwordHash,
    });
    const saved = await this.usuariosRepository.save(user);
    return this.stripSecrets(saved);
  }

  /**
   * El hash nunca sale del backend. La columna ya es `select: false`, pero en
   * la ruta de creacion la entidad viene de memoria, no de la base, asi que hay
   * que quitarlo a mano.
   */
  private stripSecrets(user: Usuarios): Omit<Usuarios, 'passwordHash'> {
    const { passwordHash: _omitted, ...safe } = user;
    return safe as Omit<Usuarios, 'passwordHash'>;
  }

  /** Acotado: la tabla de usuarios no tiene por que caber entera en memoria. */
  findAll(rol?: Usuarios['rol'], limit = 200, offset = 0) {
    return this.usuariosRepository.find({
      where: rol ? { rol } : undefined,
      order: { createdAt: 'DESC' },
      take: Math.min(500, Math.max(1, Math.trunc(limit))),
      skip: Math.max(0, Math.trunc(offset)),
    });
  }

  findOne(id: string) {
    return this.usuariosRepository.findOne({ where: { id } });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const { password, ...toUpdate } = updateUserDto as any;
    const updateData: any = { ...toUpdate };

    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateData.passwordHash = await bcrypt.hash(password, salt);
    }

    await this.usuariosRepository.update(id, updateData);
    return this.findOne(id);
  }

  async remove(id: string) {
    await this.usuariosRepository.delete(id);
    return { deleted: true };
  }
}
