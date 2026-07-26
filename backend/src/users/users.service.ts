import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Usuarios } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

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

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos de validez

    user.telegramVerificationCode = code;
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

  async create(createUserDto: CreateUserDto) {
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(createUserDto.password, salt);
    const user = this.usuariosRepository.create({
      ...createUserDto,
      passwordHash,
    });
    return this.usuariosRepository.save(user);
  }

  findAll(rol?: Usuarios['rol']) {
    if (rol) {
      return this.usuariosRepository.find({ where: { rol } });
    }
    return this.usuariosRepository.find();
  }

  findOne(id: string) {
    return this.usuariosRepository.findOne({ where: { id } });
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const { password, ...toUpdate } = updateUserDto;
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
