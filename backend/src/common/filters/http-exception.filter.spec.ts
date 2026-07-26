import { HttpExceptionFilter } from './http-exception.filter';
import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: any;
  let mockRequest: any;
  let mockArgumentsHost: ArgumentsHost;
  let loggerErrorSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockRequest = {
      method: 'POST',
      url: '/test-route',
    };
    mockArgumentsHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as any;

    loggerErrorSpy = jest
      .spyOn((filter as any).logger, 'error')
      .mockImplementation();
    loggerWarnSpy = jest
      .spyOn((filter as any).logger, 'warn')
      .mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should handle standard HttpException with status and message', () => {
    const exception = new HttpException(
      'Credenciales inválidas',
      HttpStatus.UNAUTHORIZED,
    );

    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.UNAUTHORIZED,
        error: 'HttpException',
        message: 'Credenciales inválidas',
        path: '/test-route',
      }),
    );
    expect(loggerWarnSpy).toHaveBeenCalled();
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  it('should handle standard validation HttpException format', () => {
    const validationMessage = [
      'name must be a string',
      'email must be an email',
    ];
    const exception = new HttpException(
      { message: validationMessage, error: 'Bad Request' },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: validationMessage,
      }),
    );
    expect(loggerWarnSpy).toHaveBeenCalled();
  });

  it('should translate database unique constraint violation (23505) to HTTP 409 Conflict', () => {
    const dbError = new QueryFailedError(
      'query',
      [],
      new Error('duplicate key'),
    );
    (dbError as any).code = '23505';

    filter.catch(dbError, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: 'El registro ya existe (violación de clave única).',
      }),
    );
    expect(loggerWarnSpy).toHaveBeenCalled();
  });

  it('should handle generic Error and classify as 500 Internal Server Error', () => {
    const error = new Error('Test server failure');

    filter.catch(error, mockArgumentsHost);

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error',
        message: 'Test server failure',
      }),
    );
    expect(loggerErrorSpy).toHaveBeenCalled();
  });
});
