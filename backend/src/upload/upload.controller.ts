import {
  Controller,
  Get,
  Post,
  Query,
  UseInterceptors,
  UploadedFile,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }
    return this.uploadService.uploadFile(file);
  }

  @Post('private')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPrivateFile(
    @UploadedFile() file: any,
    @Body('folder') folder?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No se proporcionó ningún archivo');
    }
    return this.uploadService.uploadPrivateFile(file, folder || 'comprobantes');
  }

  @Get('private-url')
  async getPresignedUrl(
    @Query('key') key: string,
    @Query('expiresIn') expiresIn?: string,
  ) {
    if (!key) {
      throw new BadRequestException(
        'No se proporcionó la clave (key) del archivo',
      );
    }
    const expires = expiresIn ? parseInt(expiresIn, 10) : 3600;
    return this.uploadService.getPresignedUrl(key, expires);
  }

  @Post('delete')
  async deleteFile(@Body('url') url: string) {
    if (!url) {
      throw new BadRequestException('No se proporcionó la URL del archivo');
    }
    return this.uploadService.deleteFile(url);
  }

  @Post('private/delete')
  async deletePrivateFile(@Body('key') key: string) {
    if (!key) {
      throw new BadRequestException(
        'No se proporcionó la clave (key) del archivo',
      );
    }
    return this.uploadService.deletePrivateFile(key);
  }
}
