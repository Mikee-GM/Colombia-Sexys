import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsBoolean,
  IsOptional,
  IsEmail,
  MinLength,
  IsNumber,
  IsArray,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateExtraDto {
  @ApiProperty({
    description: 'Nombre del servicio extra',
    example: 'Masaje',
    maxLength: 150,
  })
  @IsString({ message: 'El nombre del servicio extra debe ser texto' })
  @IsNotEmpty({ message: 'El nombre del servicio extra es obligatorio' })
  @MaxLength(150, {
    message: 'El nombre del servicio extra no puede superar los 150 caracteres',
  })
  readonly nombre: string;

  @ApiProperty({
    description: 'Precio del servicio extra',
    example: 50,
  })
  @IsNumber(
    {},
    { message: 'El precio del servicio extra debe ser un número válido' },
  )
  @IsNotEmpty({ message: 'El precio del servicio extra es obligatorio' })
  readonly precio: number;
}

export class CreateEmployeeDto {
  @ApiProperty({
    description: 'Correo electronico de la empleada',
    example: 'empleada@example.com',
    maxLength: 255,
  })
  @IsEmail({}, { message: 'El correo electrónico debe ser válido' })
  @IsNotEmpty({ message: 'El correo electrónico es obligatorio' })
  @MaxLength(255, {
    message: 'El correo electrónico no puede superar los 255 caracteres',
  })
  readonly email: string;

  @ApiProperty({
    description: 'Contrasena inicial de la empleada',
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
    description: 'Nombre real de la empleada',
    example: 'Ana Garcia',
    maxLength: 255,
  })
  @IsString({ message: 'El nombre real debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre real es obligatorio' })
  @MaxLength(255, {
    message: 'El nombre real no puede superar los 255 caracteres',
  })
  readonly nombreReal: string;

  @ApiProperty({
    description: 'Nombre artistico mostrado en catalogo',
    example: 'Anita',
    maxLength: 255,
  })
  @IsString({ message: 'El nombre artístico debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El nombre artístico es obligatorio' })
  @MaxLength(255, {
    message: 'El nombre artístico no puede superar los 255 caracteres',
  })
  readonly nombreArtistico: string;

  @ApiProperty({
    description: 'Slug unico para el catalogo publico',
    example: 'anita',
    maxLength: 100,
  })
  @IsString({ message: 'El slug del catálogo debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El slug del catálogo es obligatorio' })
  @MaxLength(100, {
    message: 'El slug del catálogo no puede superar los 100 caracteres',
  })
  readonly slugCatalogo: string;

  @ApiPropertyOptional({
    description: 'URL de la foto principal de perfil',
    example: 'https://example.com/perfil.jpg',
  })
  @IsString({
    message: 'La URL de la foto de perfil debe ser una cadena de texto',
  })
  @IsOptional()
  readonly fotoPerfilUrl?: string;

  @ApiPropertyOptional({
    description: 'Descripcion publica o interna de la empleada',
    example: 'Disponible para servicios en zona centro.',
  })
  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  @IsOptional()
  readonly descripcion?: string;

  @ApiProperty({ description: 'Precio base por hora pactado', example: 1200 })
  @IsNumber(
    {},
    { message: 'El precio base por hora debe ser un número válido' },
  )
  @IsNotEmpty({ message: 'El precio base por hora es obligatorio' })
  readonly precioBaseHora: number;

  @ApiPropertyOptional({
    description: 'Indica si la empleada esta disponible',
    example: true,
    default: true,
  })
  @IsBoolean({ message: 'El estado disponible debe ser un valor booleano' })
  @IsOptional()
  readonly disponible?: boolean;

  @ApiPropertyOptional({
    description: 'Indica si aparece activa en catalogo',
    example: true,
    default: true,
  })
  @IsBoolean({
    message: 'El estado del catálogo activo debe ser un valor booleano',
  })
  @IsOptional()
  readonly catalogoActivo?: boolean;

  @ApiPropertyOptional({
    description: 'Latitud actual o registrada',
    example: '19.432608',
  })
  @IsString({ message: 'La latitud debe ser una cadena de texto' })
  @IsOptional()
  readonly ubicacionLat?: string;

  @ApiPropertyOptional({
    description: 'Longitud actual o registrada',
    example: '-99.133209',
  })
  @IsString({ message: 'La longitud debe ser una cadena de texto' })
  @IsOptional()
  readonly ubicacionLng?: string;

  @ApiPropertyOptional({
    description: 'ID del jefe asignado',
    example: '00000000-0000-4000-8000-000000000000',
    format: 'uuid',
  })
  @IsString({ message: 'El ID del jefe debe ser una cadena de texto' })
  @IsOptional()
  readonly jefeId?: string;

  @ApiPropertyOptional({
    description: 'ID del jefe secundario asignado',
    example: '00000000-0000-4000-8000-000000000000',
    format: 'uuid',
  })
  @IsString({
    message: 'El ID del jefe secundario debe ser una cadena de texto',
  })
  @IsOptional()
  readonly jefeSecundarioId?: string;

  @ApiPropertyOptional({
    description: 'ID del apartamento/departamento asignado',
    example: '00000000-0000-4000-8000-000000000000',
    format: 'uuid',
  })
  @IsString({ message: 'El ID del apartamento debe ser una cadena de texto' })
  @IsOptional()
  readonly apartmentId?: string;

  @ApiPropertyOptional({
    description: 'Enlace de la red social X (Twitter)',
    example: 'https://x.com/usuario',
  })
  @IsString({ message: 'El enlace de X debe ser una cadena de texto' })
  @IsOptional()
  readonly linkX?: string;

  @ApiPropertyOptional({
    description: 'Etiqueta para iniciar contacto (WhatsApp/Telegram)',
    example: 'Escribeme por WhatsApp',
  })
  @IsString({ message: 'La etiqueta de contacto debe ser una cadena de texto' })
  @IsOptional()
  readonly contactLabel?: string;

  @ApiPropertyOptional({
    description: 'URLs de fotos adicionales',
    example: ['https://example.com/foto-1.jpg'],
    type: [String],
  })
  @IsArray({ message: 'Las fotos extras deben proporcionarse como un arreglo' })
  @IsString({
    each: true,
    message: 'Cada foto extra debe ser una cadena de texto con la URL',
  })
  @IsOptional()
  readonly fotosExtra?: string[];

  @ApiPropertyOptional({
    description: 'Servicios extra con sus precios',
    type: [CreateExtraDto],
  })
  @IsArray({ message: 'Los extras deben ser un arreglo' })
  @ValidateNested({ each: true })
  @Type(() => CreateExtraDto)
  @IsOptional()
  readonly extras?: CreateExtraDto[];
}
