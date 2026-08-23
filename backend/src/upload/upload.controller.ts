import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  UploadService,
  UPLOAD_MAX_BYTES,
  type UploadedFilePayload,
} from './upload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * Solo quedan las dos rutas que la aplicacion usa de verdad (fotos de catalogo).
 *
 * Se eliminaron `POST /upload/private`, `GET /upload/private-url` y
 * `POST /upload/private/delete`: aceptaban una `key` arbitraria del cliente y
 * firmaban o borraban cualquier objeto del bucket privado —comprobantes de pago
 * de terceros incluidos— con solo estar autenticado. No tenian ningun consumidor
 * en el repositorio. Si en el futuro hace falta servir un archivo privado, la
 * ruta debe resolver la key desde el recurso (por ejemplo
 * `GET /services/:id/receipt-url`) y validar la propiedad, nunca aceptarla por
 * parametro.
 */
@Controller('upload')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'jefe')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: UPLOAD_MAX_BYTES } }),
  )
  async uploadFile(@UploadedFile() file?: UploadedFilePayload) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }
    return this.uploadService.uploadFile(file);
  }

  @Post('delete')
  async deleteFile(@Body('url') url?: string) {
    if (!url) {
      throw new BadRequestException('No se proporcionó la URL del archivo');
    }
    return this.uploadService.deleteFile(url);
  }
}
