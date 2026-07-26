import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  IsEnum,
  IsBoolean,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: 'Correo electronico del usuario',
    example: 'usuario@example.com',
    maxLength: 255,
  })
  @IsEmail({}, { message: 'El correo electrónico debe ser válido' })
  @MaxLength(255, {
    message: 'El correo electrónico no puede superar los 255 caracteres',
  })
  readonly email: string;

  @ApiProperty({
    description: 'Contrasena inicial del usuario',
    example: 'secret123',
    minLength: 6,
  })
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  readonly password: string;

  @ApiProperty({
    description: 'Rol operativo del usuario',
    enum: ['jefe', 'empleada', 'chofer', 'admin'],
    example: 'jefe',
  })
  @IsEnum(['jefe', 'empleada', 'chofer', 'admin'], {
    message:
      'El rol debe ser uno de los siguientes: jefe, empleada, chofer, admin',
  })
  readonly rol: 'jefe' | 'empleada' | 'chofer' | 'admin';

  @ApiPropertyOptional({
    description: 'Indica si el usuario esta activo',
    example: true,
    default: true,
  })
  @IsBoolean({ message: 'El estado activo debe ser un valor booleano' })
  @IsOptional()
  readonly activo?: boolean;

  @ApiPropertyOptional({
    description: 'Indica si el usuario (jefe/chofer) está disponible',
    example: true,
    default: true,
  })
  @IsBoolean({ message: 'El estado disponible debe ser un valor booleano' })
  @IsOptional()
  readonly disponible?: boolean;

  @ApiPropertyOptional({ description: 'Nombre del usuario', example: 'Juan' })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsOptional()
  readonly nombre?: string;

  @ApiPropertyOptional({
    description: 'Apellido del usuario',
    example: 'Pérez',
  })
  @IsString({ message: 'El apellido debe ser una cadena de texto' })
  @IsOptional()
  readonly apellido?: string;

  @ApiPropertyOptional({
    description: 'Chat ID de Telegram vinculado al usuario',
    example: '123456789',
  })
  @IsString({
    message: 'El ID de chat de Telegram debe ser una cadena de texto',
  })
  @IsOptional()
  readonly telegramChatId?: string;
}
