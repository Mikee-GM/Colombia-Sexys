import { NestFactory, Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  ClassSerializerInterceptor,
  INestApplication,
  RequestMethod,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Enable shutdown hooks for graceful cleanup
  app.enableShutdownHooks();

  /*
   * La IP del cliente llega en `X-Forwarded-For`, puesta por el proxy.
   *
   * Se confia solo en los saltos internos --loopback y redes privadas--, que
   * son nginx y el contenedor del frontend. Confiar en cualquiera dejaria que
   * el propio cliente eligiera su IP con solo mandar la cabecera, y con ella
   * el cubo del limite de peticiones y lo que quede escrito en los registros.
   *
   * El limite de peticiones ya no depende de esto --se cuenta por cuenta y por
   * sesion, ver `HttpThrottlerGuard`-- pero para el trafico anonimo la IP sigue
   * siendo lo unico que hay.
   */
  app.set('trust proxy', 'loopback, linklocal, uniquelocal');

  // Security headers using Helmet
  app.use(helmet());
  app.use(cookieParser(process.env.COOKIE_SECRET));

  // Explicit CORS configuration
  app.enableCors({
    origin: (process.env.WEB_URL || 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim()),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Segunda capa sobre `select: false`: respeta los @Exclude() de las entidades
  // para que un campo sensible no salga aunque alguien lo cargue a proposito.
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // Global Exception Filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Prefijo y version en la URL: toda la API cuelga de `/api/v1`. Sin esto un
  // cambio incompatible obligaba a migrar a todos los clientes a la vez; ahora
  // un controlador puede publicar `@Version('2')` y convivir con el anterior.
  //
  // Quedan fuera del prefijo las rutas que consume infraestructura ajena y que
  // no deben versionarse: las sondas de Docker.
  //
  // Ojo: `exclude` solo quita el prefijo `/api`, no la version. Estas rutas
  // ademas llevan `@Version(VERSION_NEUTRAL)` en su handler; sin eso quedarian
  // publicadas en `/v1/health/ready` y el healthcheck del contenedor recibiria
  // un 404.
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'health/live', method: RequestMethod.GET },
      { path: 'health/ready', method: RequestMethod.GET },
    ],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Swagger solo fuera de produccion: el documento es un mapa completo de la
  // superficie de ataque (cada ruta, cada DTO, cada campo de cada entidad) y no
  // aporta nada al cliente final.
  if (process.env.NODE_ENV !== 'production') {
    setupSwagger(app);
  }

  await app.listen(process.env.PORT ?? 4000);
}

function setupSwagger(app: INestApplication) {
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Backend Citas API')
    .setDescription('Documentacion de endpoints, DTOs y entidades de la API.')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Pega aqui el token JWT sin el prefijo Bearer.',
      },
      'jwt',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  // No puede seguir en `/api`: ese espacio es ahora la propia API.
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs-json',
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });
}

void bootstrap();
