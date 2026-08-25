import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsUUID,
} from 'class-validator';

/** Las dos galerias de una modelo. */
export const PHOTO_GALLERIES = ['publica', 'exclusiva'] as const;
export type PhotoGallery = (typeof PHOTO_GALLERIES)[number];

export class ReorderPhotosDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  readonly empleadaId: string;

  @ApiProperty({ enum: PHOTO_GALLERIES })
  @IsIn(PHOTO_GALLERIES as unknown as string[])
  readonly gallery: PhotoGallery;

  /**
   * Ids en el orden deseado. Se reescribe la galeria completa, no posiciones
   * sueltas: mover una foto cambia la posicion de todas las demas.
   */
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  readonly ids: string[];
}

export class MovePhotoDto {
  @ApiProperty({ enum: PHOTO_GALLERIES, description: 'Galeria de origen' })
  @IsIn(PHOTO_GALLERIES as unknown as string[])
  readonly from: PhotoGallery;

  @ApiPropertyOptional({
    enum: PHOTO_GALLERIES,
    description: 'Galeria de destino',
  })
  @IsIn(PHOTO_GALLERIES as unknown as string[])
  readonly to: PhotoGallery;
}
