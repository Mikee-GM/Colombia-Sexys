import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: any = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        message = (exceptionResponse as any).message || exceptionResponse;
        error = (exceptionResponse as any).error || exception.name;
      } else {
        message = exceptionResponse;
        error = exception.name;
      }
    } else if (exception instanceof QueryFailedError) {
      // Safely catch database constraint violations without leaking raw query details to the client
      const dbError = exception as any;
      const code = dbError.code;
      status = HttpStatus.BAD_REQUEST;
      error = 'Database Error';

      if (code === '23505') {
        status = HttpStatus.CONFLICT;
        message = 'El registro ya existe (violación de clave única).';
        error = 'Conflict';
      } else if (code === '23503') {
        message =
          'No se pudo realizar la operación debido a una restricción de clave foránea.';
        error = 'Foreign Key Constraint';
      } else if (code === '23514') {
        message = 'Violación de restricción check en base de datos.';
        error = 'Check Constraint';
      } else {
        message = 'Error de base de datos interno.';
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    // Log the error internally with appropriate severity levels
    const logMessage = `${request.method} ${request.url} - Status: ${status} - Error: ${
      exception instanceof Error
        ? exception.message
        : typeof exception === 'object' && exception !== null
          ? JSON.stringify(exception)
          : String(exception)
    }`;

    if (status >= 500) {
      this.logger.error(
        logMessage,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(logMessage);
    }

    const errorResponse = {
      statusCode: status,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(errorResponse);
  }
}
