import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { Usuarios } from './entities/user.entity';
import { UserSeederService } from './user-seeder.service';

@Module({
  imports: [TypeOrmModule.forFeature([Usuarios])],
  controllers: [UsersController],
  providers: [UsersService, UserSeederService],
  exports: [UsersService],
})
export class UsersModule {}
