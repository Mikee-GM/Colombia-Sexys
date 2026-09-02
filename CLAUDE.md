# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Idioma

El código, los comentarios, la documentación y toda la interfaz están en
español. Escribe en español al añadir comentarios, mensajes de error, textos de
UI o documentación.

## Comandos

Monorepo pnpm (Node 20+, pnpm 10.34.0 vía Corepack). Todos los scripts se
ejecutan desde la raíz salvo que se indique lo contrario.

```bash
pnpm install --frozen-lockfile

pnpm dev:backend      # NestJS en watch (puerto 4000)
pnpm dev:frontend     # Next.js (puerto 3000)

pnpm lint             # backend + frontend
pnpm test             # solo backend; el frontend no tiene suite
pnpm build
pnpm check            # lint + test + build, la misma secuencia que CI
```

Una sola prueba o un solo archivo del backend:

```bash
corepack pnpm --filter backend exec jest telegram-booking-session
corepack pnpm --filter backend exec jest -t "nombre del it"
```

Los tests son Jest con `rootDir: src` y `testRegex: .*\.spec\.ts$`: los `.spec.ts`
viven junto al archivo que prueban, no en `test/`.

Typecheck del frontend (no hay script propio; el build lo hace implícitamente):

```bash
corepack pnpm --filter catalogo-cs exec tsc --noEmit
```

### Migraciones

```bash
cd backend
corepack pnpm migration:generate src/migrations/NombreDescriptivo
corepack pnpm migration:run      # compila y ejecuta desde dist/
corepack pnpm migration:show
corepack pnpm migration:revert
```

Los scripts compilan primero porque `src/data-source.ts` apunta a
`dist/**/*.entity.js` y `dist/migrations/*.js`. `migrationsTransactionMode` es
`each` (una transacción por migración), así que una migración puede declararse
no transaccional para usar `CREATE INDEX CONCURRENTLY`; a cambio, si falla la
tercera de cinco las dos primeras quedan aplicadas. Por eso todas las
migraciones usan `IF EXISTS` / `IF NOT EXISTS` y reintentar el despliegue es
seguro.

### Docker

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db backend
docker compose config --quiet
```

Nunca ejecutes `docker compose down -v`: borra el volumen
`colombia_sexys_postgres_data`. El README de la raíz documenta el despliegue en
producción, backups, restauración y rollback.

## Arquitectura

Dos paquetes: `backend` (NestJS 11 + TypeORM + PostgreSQL 16) y `catalogo-cs`
(Next.js 15 App Router + React 19 + Tailwind 4).

### Camino de una petición

El navegador nunca habla directo con NestJS. `catalogo-cs/middleware.ts`
reescribe `/api/*` hacia `BACKEND_API_URL` traduciendo el prefijo a
`/api/v1/*`, salvo las rutas propias de Next (`/api/assistant`, `/api/auth`,
`/api/health`, `/api/realtime`). En el servidor, `lib/api-server.ts#apiFetch`
llama al backend reenviando cookies y `x-csrf-token`.

Consecuencias que hay que respetar:

- `BACKEND_API_URL` es exclusivamente de servidor (`http://backend:4000` en
  Docker, `http://localhost:4000` en local). Nunca la expongas al cliente.
- El frontend no accede a PostgreSQL, R2, JWT, Telegram ni IA. Toda
  persistencia, autenticación y subida de archivos pasa por el backend.
- Si cambias la versión de la API, `lib/api-constants.ts` es la fuente única:
  vive aparte de `api-server.ts` porque el middleware corre en runtime edge y no
  puede importar `next/headers`.
- `main.ts` excluye del prefijo `/api` las rutas de infraestructura
  (`health/live`, `health/ready`, `telegram/webhook/:recordId`), y esas además
  llevan `@Version(VERSION_NEUTRAL)` porque `exclude` no quita la versión.

### Backend: módulos de feature

Cada dominio es un módulo con `*.controller.ts`, `*.service.ts`, `dto/` y
`entities/`. El controller no lleva lógica de negocio.

Ojo con el vocabulario mixto: **las carpetas y clases de módulo están en inglés,
pero las entidades y tablas están en español** (`employees/entities/employee.entity.ts`
exporta `Empleadas` sobre la tabla `empleadas`; también `Usuarios`, `Choferes`,
`Servicios`, …). Al buscar código, prueba ambos idiomas.

Las entidades se registran con `autoLoadEntities` desde el `forFeature` de cada
módulo; no hay glob explícito. `synchronize: false` siempre.

### Filosofía "Heavy DB"

Los cálculos agregados y costosos viven en PostgreSQL (triggers, funciones
PL/pgSQL), no en memoria del backend: totales de servicio con extras, Haversine
para el chofer más cercano, etc. El backend inserta y recarga, o recibe el valor
ya calculado. Detalle completo en `backend/.agents/rules/heavydb-rules.md`.

Tipos obligatorios: dinero en `numeric` con `ColumnNumericTransformer`, fechas en
`timestamptz`, IDs de chat de Telegram en `bigint` mapeados a `string`.

### Dinero y zona horaria

El negocio se opera **desde México** aunque las modelos del catálogo sean
colombianas. `backend/src/common/locale.ts` y `catalogo-cs/lib/locale.ts` fijan
`America/Mexico_City` y `es-MX`; ninguna vista debe fijar su propia zona.

Toda aritmética de importes pasa por `backend/src/common/money.ts` (`toCents`,
`fromCents`, `sumMoney`, `multiplyMoney`): se opera en centavos enteros y solo
se vuelve a unidades al presentar o guardar.

### Autenticación

Reglas completas y no negociables en `catalogo-cs/rules.md`. Lo esencial:

- Los tokens viven solo en cookies `httpOnly` **firmadas** que emite NestJS
  (`backend/src/auth/auth.constants.ts`). Nunca en `localStorage`.
- `access_token` de 15 min; `refresh_token` de larga vida, persistido en base y
  restringido a `path: /auth/refresh`.
- Cookie CSRF no-`httpOnly` más header `x-csrf-token`, verificado por
  `CsrfGuard` en las peticiones que mutan estado.
- Autorización con `JwtAuthGuard` + `RolesGuard` y `@Roles(...)`. Roles:
  `admin`, `jefe`, `empleada`, `chofer`.
- El middleware de Next solo redirige según la *presencia* de la cookie. La
  autorización real siempre ocurre en el backend.
- Dos caminos de acceso alternativos: `PortalAuthGuard` (portales de empleada y
  chofer abiertos desde una Mini App de Telegram; admite token por query, Bearer
  o cookie y deja `request.portalUserId`) y `PanelAccessService` (pases de un
  solo uso de 5 min enviados por chat, con destino guardado en base y
  restringido por una lista blanca de rutas internas).
- `AuthCleanupScheduler` purga sesiones y pases caducados.

### Tiempo real

SSE desde `RealtimeEventsService`, con canales por destinatario (`jefes`,
`boss`, `employee`, `driver`, `client`) y contador de suscriptores para liberar
los `Subject` cuando se va el último cliente. Entre réplicas, `RealtimeBus`
publica en una outbox y usa `LISTEN/NOTIFY` de Postgres; la entrega local no
depende de esa conexión.

### Trabajos periódicos

Cualquier ciclo no idempotente (recordatorios, retos, contenido semanal, barrido
de la outbox) debe envolverse en
`common/scheduling/advisory-lock.ts#withAdvisoryLock`, con una clave numérica
propia. Sin él, dos réplicas duplican cada mensaje.

### Telegram

`nestjs-telegraf`. Hay **un solo bot** (`TELEGRAM_BOT_TOKEN`) para todos:
clientes, empleadas, choferes, jefes, admin y onboarding de candidatas. Hubo una
etapa con un bot dedicado por modelo; se eliminó, y `telegram-session.key.ts`
todavía entiende las claves de sesión de entonces porque las filas viven 30
días. No vuelvas a introducir enrutado por bot: `@InjectBot()` es el único bot.

Con `TELEGRAM_WEBHOOK_BASE_URL` definida se usan webhooks; vacía, long polling.
Con `APP_INSTANCE_COUNT > 1` el long polling rompe en silencio (Telegram
devuelve 409 a uno de los procesos), por eso la configuración se valida al
arrancar. El flujo de alta de una empleada y el modelo de grupos con temas están
en `backend/Docs.md`.

Los handlers (`@Update()`, `@Command()`) solo traducen el `Context` a una llamada
de servicio, igual que un controller HTTP.

### Todas las empleadas son de agencia

No existen las empleadas independientes. Siempre hay un jefe (o un admin) que
autoriza los servicios: `ServicesService.aceptar()` y `.rechazar()` exigen rol
`jefe` o `admin`, y eso es deliberado, no una limitación que haya que relajar.
Una empleada nunca acepta su propio servicio ni recibe directamente la
solicitud del cliente, y `/vincular_grupo` es solo para jefes y admins.

Si el jefe principal de una empleada está inactivo, no disponible o cerró su
jornada, el servicio pasa al secundario, y si tampoco hay, a cualquier jefe o
admin activo (`findAssignedJefe` y `ServicesService.create`).

### IA

`AiModule` encapsula el proveedor en `AiProviderService`; nunca llames al SDK
desde un controller o desde lógica de negocio. Los prompts viven versionados en
`src/ai/prompts/`, no incrustados en el código, y `ai-guardrails.ts` valida el
output. Modelo y temperatura son configurables por entorno (`AI_CHAT_MODEL`,
`AI_VISION_MODEL`, `AI_CHAT_TEMPERATURE`) para poder cambiarlos sin desplegar.
Límite por cliente vía `MAX_DAILY_AI_CALLS`.

### Frontend

- Las páginas son Server Components que resuelven sesión con
  `lib/auth.ts#getCurrentUser` (envuelto en `cache()` de React para deduplicar
  por petición) y piden sus datos en paralelo.
- Cada fuente de datos de una pantalla se envuelve en
  `lib/optional-source.ts#optionalSource`: degrada un fallo de red a un valor por
  defecto pero **reemite** las redirecciones de Next, porque `apiFetch` corta la
  sesión llamando a `redirect`.
- `lib/actions/*` contiene las Server Actions por dominio; `lib/data/*` las
  lecturas. Las peticiones autenticadas se fuerzan a `no-store`; solo las
  públicas pueden pedir ISR.
- Rutas: `/` catálogo público, `/admin/*` panel, `/jefe/*` panel de jefe,
  `/empleada/portal` y `/chofer/portal` (Mini Apps), `/acceso/[token]` canje de
  pases.
- `next.config.ts` tiene `eslint.ignoreDuringBuilds: true` como deuda técnica
  pendiente: el build no valida lint, hay que ejecutarlo aparte.
- Las maquetas del ERP viven como design canvases en `design/erp/*.dc.html`.

## Reglas de producto y UI

Definidas en `catalogo-cs/AGENTS.md` (cargado por `catalogo-cs/CLAUDE.md`):

- **Cero emojis**, en cualquier texto, comentario o mensaje. Innegociable.
- Tono sofisticado y profesional; interfaz íntegramente en español.
- Tipografía: Cormorant Garamond para títulos, Inter para el resto. Nunca
  fuentes del sistema.
- Paleta: negro (#000000, #050505, #0A0A0A), dorado (#C5A55A, #D4AF37, #E8D5A3,
  #8B7635), acentos zinc. Nunca fondo blanco.
- Mobile-first, scroll natural (sin snap-scroll).
- Reutilizar componentes genéricos antes de crear variantes.

## Reglas detalladas por área

- `backend/.agents/rules/backend-rules.md` — NestJS, DTOs, errores, seguridad,
  bots con Telegraf.
- `backend/.agents/rules/heavydb-rules.md` — tipos exactos, triggers, migraciones.
- `backend/.agents/rules/ai-rules.md` — abstracción de proveedor, reintentos,
  costos, prompt injection.
- `catalogo-cs/rules.md` — cookies y tokens entre Next.js y NestJS.
- `backend/.agents/skills/nestjs-best-practices/` — reglas granulares por tema.

## Configuración

Tres plantillas de entorno: `.env` (Compose), `backend/.env` y
`catalogo-cs/.env.local`. El backend valida su esquema con Joi al arrancar
(`app.module.ts`) y no inicia si falta una variable crítica; añade allí toda
variable nueva. Usa `ConfigService` inyectado, no `process.env` disperso.
