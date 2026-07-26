import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsBoolean,
  IsOptional,
  IsEmail,
  MinLength,
} from 'class-validator';

export class CreateDriverDto {
  @ApiProperty({
    description: 'Correo electronico del chofer',
    example: 'chofer@example.com',
    maxLength: 255,
  })
  @IsEmail({}, { message: 'El correo electrónico debe ser válido' })
  @IsNotEmpty({ message: 'El correo electrónico es obligatorio' })
  @MaxLength(255, {
    message: 'El correo electrónico no puede superar los 255 caracteres',
  })
  readonly email: string;

  @ApiProperty({
    description: 'Contrasena inicial del usuario chofer',
    example: 'secret123',
    minLength: 6,
  })
  @IsString({ message: 'La contraseña debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La contraseña es obligatoria' })
  @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
  readonly password: string;

  @ApiPropertyOptional({
    description: 'Chat ID de Telegram vinculado al usuario',
    example: '123456789',
  })
  @IsString({
    message: 'El ID de chat de Telegram debe ser una cadena de texto',
  })
  @IsOptional()
  readonly telegramChatId?: string;

  @ApiProperty({
    description: 'Nombre del chofer',
    example: 'Carlos Perez',
    maxLength: 255,
  })
  @IsString({ message: 'El nombre debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  @MaxLength(255, { message: 'El nombre no puede superar los 255 caracteres' })
  readonly nombre: string;

  @ApiProperty({
    description: 'Telefono de contacto del chofer',
    example: '+525512345678',
    maxLength: 30,
  })
  @IsString({ message: 'El teléfono debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El teléfono es obligatorio' })
  @MaxLength(30, { message: 'El teléfono no puede superar los 30 caracteres' })
  readonly telefono: string;

  @ApiPropertyOptional({
    description: 'Indica si el chofer esta disponible',
    example: true,
    default: true,
  })
  @IsBoolean({ message: 'El estado disponible debe ser un valor booleano' })
  @IsOptional()
  readonly disponible?: boolean;

  @ApiPropertyOptional({
    description: 'Latitud actual o registrada del chofer',
    example: '19.432608',
  })
  @IsString({ message: 'La latitud debe ser una cadena de texto' })
  @IsOptional()
  readonly ubicacionLat?: string;

  @ApiPropertyOptional({
    description: 'Longitud actual o registrada del chofer',
    example: '-99.133209',
  })
  @IsString({ message: 'La longitud debe ser una cadena de texto' })
  @IsOptional()
  readonly ubicacionLng?: string;

  @ApiPropertyOptional({
    description: 'Marca del vehiculo',
    example: 'Nissan',
    maxLength: 255,
  })
  @IsString({ message: 'La marca del vehículo debe ser una cadena de texto' })
  @IsOptional()
  @MaxLength(255, {
    message: 'La marca del vehículo no puede superar los 255 caracteres',
  })
  readonly vehiculoMarca?: string;

  @ApiPropertyOptional({
    description: 'Modelo del vehiculo',
    example: 'Versa',
    maxLength: 255,
  })
  @IsString({ message: 'El modelo del vehículo debe ser una cadena de texto' })
  @IsOptional()
  @MaxLength(255, {
    message: 'El modelo del vehículo no puede superar los 255 caracteres',
  })
  readonly vehiculoModelo?: string;

  @ApiPropertyOptional({
    description: 'Color del vehiculo',
    example: 'Blanco',
    maxLength: 255,
  })
  @IsString({ message: 'El color del vehículo debe ser una cadena de texto' })
  @IsOptional()
  @MaxLength(255, {
    message: 'El color del vehículo no puede superar los 255 caracteres',
  })
  readonly vehiculoColor?: string;

  @ApiPropertyOptional({
    description: 'Placa del vehiculo',
    example: 'ABC-123-D',
    maxLength: 50,
  })
  @IsString({ message: 'La placa del vehículo debe ser una cadena de texto' })
  @IsOptional()
  @MaxLength(50, {
    message: 'La placa del vehículo no puede superar los 50 caracteres',
  })
  readonly vehiculoPlaca?: string;
}
