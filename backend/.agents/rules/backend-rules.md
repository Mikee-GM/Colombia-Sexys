---
trigger: always_on
description: Reglas de arquitectura Heavy DB y precisión de tipos para NestJS y PostgreSQL
---

# RULES.md — NestJS & Backend Best Practices

## 1. Arquitectura del Proyecto

- **Modularidad estricta**: cada feature vive en su propio módulo (`*.module.ts`) con sus controllers, services, DTOs y entities. Nunca mezclar lógica de dominios distintos en un mismo módulo.
- **Separación por capas**: Controller (HTTP) → Service (lógica de negocio) → Repository/Provider (acceso a datos). El controller NUNCA debe contener lógica de negocio.
- **Dependency Inversion**: los servicios dependen de interfaces/abstracciones, no de implementaciones concretas. Esto permite testear con mocks fácilmente y facilita el mantenimiento a largo plazo.
- **Shared Module**: utilidades, pipes, guards y decoradores reutilizables van en un `SharedModule` o `CommonModule`, evitando duplicación.
- Adoptar Clean Architecture cuando el proyecto crezca: separar `domain`, `application` e `infrastructure` para que la lógica de negocio no dependa de frameworks externos.

## 2. DTOs y Validación

- Usar siempre `class-validator` + `class-transformer` con `ValidationPipe` global (`whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`).
- Un DTO por operación (`CreateUserDto`, `UpdateUserDto`), nunca reutilizar entidades como DTOs de entrada/salida.
- Usar `PartialType()` de `@nestjs/mapped-types` para DTOs de actualización en lugar de duplicar campos.
- Nunca expongas entidades de base de datos directamente en las respuestas; usa DTOs de salida o `class-transformer` con `@Exclude()`.

## 3. Manejo de Errores

- Centralizar el manejo de errores con `Exception Filters` globales (`@Catch()`).
- Usar las excepciones nativas de Nest (`BadRequestException`, `NotFoundException`, etc.) en lugar de lanzar errores genéricos.
- Nunca dejar que errores internos (stack traces, mensajes de DB) lleguen al cliente; loguear el detalle internamente y devolver mensajes controlados.
- Estandarizar el formato de respuesta de error (código, mensaje, timestamp, path) para consistencia en toda la API.

## 4. Seguridad

- Aplicar `Helmet`, `CORS` configurado explícitamente (no `*` en producción) y rate limiting (`@nestjs/throttler`).
- Autenticación con JWT + refresh tokens; usar `Guards` (`AuthGuard`) y `Strategies` de Passport en lugar de validación manual en controllers.
- Autorización basada en roles/permisos con `Guards` personalizados y decoradores (`@Roles()`).
- Sanitizar y validar TODO input del usuario, incluso en queries y params, no solo en el body.
- Nunca guardar secretos en el código; usar `@nestjs/config` con variables de entorno y esquemas de validación (`Joi` o `zod`).
- Mantener dependencias actualizadas y correr auditorías de seguridad (`npm audit`, `snyk`) periódicamente.

## 5. Base de Datos

- Usar un ORM/Query Builder consistente (TypeORM, Prisma o MikroORM) y evitar mezclar accesos SQL crudos salvo casos justificados.
- Repositorios como capa de abstracción: los servicios no deben llamar directamente al ORM, sino a través de un repository/provider inyectado.
- Migraciones versionadas y automatizadas, nunca cambios manuales en el esquema de producción.
- Usar transacciones (`QueryRunner` / `$transaction`) para operaciones que afecten múltiples tablas.
- Índices y paginación obligatorios en endpoints que devuelven colecciones grandes.

## 6. Testing

- Cobertura mínima con tests unitarios (services, pipes, guards) usando Jest y mocks de dependencias vía DI.
- Tests de integración (`e2e`) para los flujos críticos de la API usando `supertest` + `TestingModule`.
- Nunca testear implementación interna; testear comportamiento observable (inputs/outputs).
- Usar fixtures y factories para datos de prueba en lugar de hardcodear objetos repetidos.

## 7. Performance & Escalabilidad

- Usar `Caching` (`@nestjs/cache-manager` con Redis) para endpoints de lectura frecuente y baja mutabilidad.
- Procesos pesados o asíncronos van a colas (`@nestjs/bull` / BullMQ), nunca bloquear el request-response con tareas largas.
- Habilitar compresión (`compression` middleware) y lazy loading de módulos poco usados.
- Monitorear con APM (New Relic, Datadog, OpenTelemetry) y logs estructurados (`pino` o `winston`) en producción.
- Para microservicios, usar los transportes nativos de Nest (TCP, Redis, Kafka, gRPC) en lugar de HTTP interno entre servicios cuando el rendimiento sea crítico [[1]](#\_\_1).

## 8. Configuración & Entornos

- `@nestjs/config` con validación de esquema al arranque; la app no debe iniciar si falta una variable crítica.
- Separar configuración por entorno (`.env.development`, `.env.production`) sin subir secretos al repo.
- Usar `ConfigService` inyectado, nunca `process.env` disperso por el código.

## 9. Documentación de API

- Swagger/OpenAPI (`@nestjs/swagger`) siempre sincronizado con los DTOs reales mediante decoradores (`@ApiProperty()`).
- Versionar la API desde el inicio (`/v1`, `/v2`) usando el versioning nativo de Nest.
- Documentar códigos de error posibles por endpoint, no solo el caso feliz.

## 10. Estilo de Código & Mantenibilidad

- ESLint + Prettier obligatorios con reglas consistentes en todo el equipo/agente.
- Nombrado consistente: `*.controller.ts`, `*.service.ts`, `*.module.ts`, `*.dto.ts`, `*.entity.ts`.
- Principio de responsabilidad única: un service no debe superar una responsabilidad clara; si crece demasiado, dividir.
- Comentarios solo donde el "por qué" no es obvio; el código debe explicarse por sí mismo mediante buen naming.
- Revisar estas reglas contra el 40%+ de mejora en mantenibilidad reportado en encuestas de la comunidad NestJS al adoptar arquitecturas modulares consistentes [[2]](#\_\_2).

# Reglas de Arquitectura "Heavy DB" (NestJS & PostgreSQL)

Este proyecto sigue la filosofía de diseño **Heavy DB (Antigravity)**, donde delegamos la lógica de negocio, consistencia, integridad de datos y cálculos costosos directamente a PostgreSQL utilizando Triggers y Funciones/Procedimientos Almacenados. NestJS actúa como un orquestador eficiente.

## 11. Arquitectura de Bots con Telegraf

- **Integración vía `nestjs-telegraf`**: no instanciar Telegraf manualmente dentro de servicios; usar `TelegrafModule.forRootAsync()` para inyectar el bot como cualquier otro provider de Nest, aprovechando DI y el ciclo de vida de módulos [[1]](#\_\_1).
- **Un módulo por bot/feature**: si el bot crece (comandos de admin, pagos, soporte), dividir en submódulos (`AdminBotModule`, `PaymentsBotModule`) en lugar de un único archivo con todos los `bot.command()`.
- **Nunca lógica de negocio en el handler**: los `@Update()`, `@Command()` o `@On()` deben delegar a un Service inyectado, igual que un Controller HTTP delega a su Service. El handler solo traduce el `Context` de Telegram a una llamada de negocio.
- **Separar Commands, Actions y Scenes en archivos propios**: estructura recomendada tipo `bot/commands/`, `bot/actions/`, `bot/scenes/`, `bot/middlewares/`, evitando un solo archivo gigante con todos los `bot.on()` [[0]](#\_\_0).

## 12. Middlewares

- Middlewares como **funciones puras y componibles**: cada uno debe tener una sola responsabilidad (logging, auth, rate-limit, i18n) y usarse con `bot.use()` o a nivel de escena/comando específico, nunca acumular lógica dispersa en el handler principal [[2]](#\_\_2).
- **Orden explícito y documentado**: el orden de los middlewares importa (ej. logging → auth → rate-limit → business logic); documentar ese orden en el propio módulo para evitar bugs sutiles al agregar nuevos middlewares.
- **Middleware de sesión antes que cualquier lógica stateful**: si usas Scenes o Wizards, el middleware de `session()` debe registrarse antes de cualquier middleware que dependa de `ctx.session`.
- Middlewares personalizados con Nest (guards, interceptors) se pueden aplicar sobre los `@Update()` igual que sobre Controllers HTTP, usando `@UseFilters()`, `@UseInterceptors()` en `nestjs-telegraf` para mantener el mismo patrón de toda la app [[3]](#\_\_3).

## 13. Manejo de Sesión y Estado

- **Nunca usar memoria en proceso (`session()` default) en producción**: usar un store persistente (Redis, MongoDB) para sesiones, ya que la sesión en memoria se pierde en cada redeploy o restart y no escala en múltiples instancias.
- Mantener el `session` **minimalista**: solo guardar lo estrictamente necesario para el flujo conversacional (paso actual, IDs), no objetos completos de dominio; el dominio se consulta desde la DB usando esos IDs.
- Limpiar sesión explícitamente al salir de una Scene (`ctx.scene.leave()`) para evitar estados colgados que rompan flujos futuros del usuario.

## 14. Scenes & Wizards (Flujos Conversacionales)

- Usar `Scenes`/`WizardScene` para cualquier flujo de más de 2 pasos (onboarding, checkout, formularios); no intentar manejar flujos multi-paso con banderas sueltas en el handler de mensajes.
- Cada Scene en su propio archivo/clase, registrada en un `Stage` centralizado; nombrar las scenes con IDs consistentes (`ONBOARDING_SCENE`, `PAYMENT_SCENE`) como constantes, nunca strings mágicos repetidos.
- Validar la entrada del usuario en cada paso de la Wizard **antes** de avanzar (`ctx.wizard.next()`); si la validación falla, repetir el paso con un mensaje claro en lugar de avanzar con datos corruptos.
- Siempre dar una salida de emergencia (`/cancel`) disponible dentro de cualquier Scene para que el usuario no quede atrapado en un flujo roto.

## 15. Manejo de Errores en el Bot

- Registrar un `bot.catch()` global (o el equivalente `Catch Filter` en `nestjs-telegraf`) para capturar errores no manejados y evitar que el bot se caiga por una excepción en un handler.
- Nunca responder al usuario con el stack trace o error crudo; enviar un mensaje amigable y loguear el detalle técnico internamente (mismo principio que la Sección 3 de errores HTTP).
- Diferenciar errores esperados (usuario mandó texto inválido → responder y continuar) de errores inesperados (fallo de red, DB caída → loguear y alertar), no tratarlos igual.

## 16. Seguridad en Bots de Telegram

- Validar siempre el `chat.id` / `from.id` contra tu whitelist o roles antes de ejecutar comandos sensibles (admin, pagos); nunca confiar en el `username` como identificador único.
- Rate limiting por usuario (no solo global) para evitar spam de comandos costosos (ej. llamadas a IA, consultas pesadas a DB); Telegraf permite middlewares de throttling por `ctx.from.id`.
- Si usas Webhooks en lugar de long polling, validar el `secret_token` de Telegram en cada request entrante y exponer el endpoint solo bajo HTTPS.
- Sanitizar cualquier input de texto libre del usuario antes de usarlo en queries, comandos de shell o prompts hacia otros servicios (mismo principio de sanitización de la Sección 4).

## 17. Testing de Bots

- Testear los Services que contienen la lógica de negocio de forma aislada (igual que en la Sección 6), mockeando el `Context` de Telegraf en lugar de levantar un bot real.
- Usar un bot de pruebas (`TEST_BOT_TOKEN`) apuntando a un entorno de staging, nunca testear contra el bot de producción.
- Para flujos de Scenes, testear cada paso de la Wizard como una función independiente que recibe un `ctx` mockeado y verifica la transición esperada.

## 18. Deploy & Modo de Conexión

- **Long polling** para desarrollo y bots de bajo/medio tráfico; **Webhooks** para producción a escala, integrados directamente con el servidor HTTP de Nest para evitar levantar un proceso aparte.
- Un solo proceso debe manejar el polling/webhook a la vez; si escalas horizontalmente con webhooks, asegurar que el balanceador enrute correctamente sin duplicar actualizaciones.
- Configurar timeouts razonables en llamadas a la API de Telegram y reintentos con backoff para evitar que un fallo temporal de red tumbe el bot completo.
