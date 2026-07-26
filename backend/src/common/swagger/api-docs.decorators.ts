import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

type ApiType = Type<unknown>;

interface CrudDocsOptions {
  tag: string;
  entity: ApiType;
  createDto?: ApiType;
  updateDto?: ApiType;
  idName?: string;
  idDescription?: string;
  protected?: boolean;
}

const idParam = (description = 'Identificador del recurso', name = 'id') =>
  ApiParam({
    name,
    description,
    example: '00000000-0000-4000-8000-000000000000',
  });

const authResponses = (protectedRoute = false) =>
  protectedRoute
    ? [
        ApiUnauthorizedResponse({
          description: 'Token JWT inválido o ausente',
        }),
        ApiForbiddenResponse({ description: 'El usuario no tiene permisos' }),
      ]
    : [];

export const ApiControllerDocs = (
  tag: string,
  protectedRoute = false,
): ClassDecorator =>
  applyDecorators(
    ApiTags(tag),
    ...(protectedRoute ? [ApiBearerAuth('jwt')] : []),
  );

export const ApiCreateDocs = ({
  tag,
  entity,
  createDto,
  protected: protectedRoute = false,
}: CrudDocsOptions): MethodDecorator =>
  applyDecorators(
    ApiOperation({ summary: `Crear ${tag}` }),
    ...(createDto ? [ApiBody({ type: createDto })] : []),
    ApiCreatedResponse({
      description: `${tag} creado correctamente`,
      type: entity,
    }),
    ApiBadRequestResponse({ description: 'Datos de entrada inválidos' }),
    ...authResponses(protectedRoute),
  );

export const ApiFindAllDocs = ({
  tag,
  entity,
  protected: protectedRoute = false,
}: CrudDocsOptions): MethodDecorator =>
  applyDecorators(
    ApiOperation({ summary: `Listar ${tag}` }),
    ApiOkResponse({
      description: `Listado de ${tag}`,
      type: entity,
      isArray: true,
    }),
    ...authResponses(protectedRoute),
  );

export const ApiFindAllByParamDocs = ({
  tag,
  entity,
  idName,
  idDescription,
  protected: protectedRoute = false,
}: CrudDocsOptions): MethodDecorator =>
  applyDecorators(
    ApiOperation({ summary: `Listar ${tag}` }),
    idParam(idDescription, idName),
    ApiOkResponse({
      description: `Listado de ${tag}`,
      type: entity,
      isArray: true,
    }),
    ...authResponses(protectedRoute),
  );

export const ApiFindOneDocs = ({
  tag,
  entity,
  idName,
  idDescription,
  protected: protectedRoute = false,
}: CrudDocsOptions): MethodDecorator =>
  applyDecorators(
    ApiOperation({ summary: `Obtener ${tag} por id` }),
    idParam(idDescription, idName),
    ApiOkResponse({ description: `${tag} encontrado`, type: entity }),
    ApiNotFoundResponse({ description: `${tag} no encontrado` }),
    ...authResponses(protectedRoute),
  );

export const ApiUpdateDocs = ({
  tag,
  entity,
  updateDto,
  idName,
  idDescription,
  protected: protectedRoute = false,
}: CrudDocsOptions): MethodDecorator =>
  applyDecorators(
    ApiOperation({ summary: `Actualizar ${tag}` }),
    idParam(idDescription, idName),
    ...(updateDto ? [ApiBody({ type: updateDto })] : []),
    ApiOkResponse({
      description: `${tag} actualizado correctamente`,
      type: entity,
    }),
    ApiBadRequestResponse({ description: 'Datos de entrada inválidos' }),
    ApiNotFoundResponse({ description: `${tag} no encontrado` }),
    ...authResponses(protectedRoute),
  );

export const ApiRemoveDocs = ({
  tag,
  idDescription,
  idName,
  protected: protectedRoute = false,
}: Omit<CrudDocsOptions, 'entity'> & { entity?: ApiType }): MethodDecorator =>
  applyDecorators(
    ApiOperation({ summary: `Eliminar ${tag}` }),
    idParam(idDescription, idName),
    ApiNoContentResponse({ description: `${tag} eliminado correctamente` }),
    ApiOkResponse({ description: `${tag} eliminado correctamente` }),
    ApiNotFoundResponse({ description: `${tag} no encontrado` }),
    ...authResponses(protectedRoute),
  );

export const ApiLoginDocs = (bodyDto: ApiType): MethodDecorator =>
  applyDecorators(
    ApiOperation({ summary: 'Iniciar sesion' }),
    ApiBody({ type: bodyDto }),
    ApiOkResponse({
      description:
        'Credenciales validas. Devuelve token JWT y datos del usuario.',
      schema: {
        example: {
          user: {
            id: '00000000-0000-4000-8000-000000000000',
            email: 'admin@example.com',
            rol: 'admin',
          },
        },
      },
    }),
    ApiUnauthorizedResponse({ description: 'Credenciales invalidas' }),
    ApiBadRequestResponse({ description: 'Datos de entrada invalidos' }),
  );

export const ApiActionDocs = (
  summary: string,
  protectedRoute = true,
  idDescription = 'Identificador del recurso',
  idName = 'id',
): MethodDecorator =>
  applyDecorators(
    ApiOperation({ summary }),
    idParam(idDescription, idName),
    ApiOkResponse({ description: 'Accion ejecutada correctamente' }),
    ApiNotFoundResponse({ description: 'Recurso no encontrado' }),
    ...authResponses(protectedRoute),
  );

export const ApiSseTokenDocs = (summary: string): MethodDecorator =>
  applyDecorators(
    ApiOperation({ summary }),
    ApiQuery({
      name: 'token',
      description: 'Token JWT usado para autenticar el canal SSE',
      required: true,
    }),
    ApiOkResponse({ description: 'Canal SSE conectado correctamente' }),
    ApiUnauthorizedResponse({ description: 'Token invalido o sin permisos' }),
  );
