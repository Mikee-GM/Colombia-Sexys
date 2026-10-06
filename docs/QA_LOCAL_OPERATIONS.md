# QA local del flujo operativo

Este procedimiento usa solo PostgreSQL local, datos ficticios y proveedores externos desactivados. No reutilices un `.env` de producción.

## 1. PostgreSQL efímero

```bash
docker run --rm --name colombia-sexys-qa-db \
  -e POSTGRES_USER=operations_qa \
  -e POSTGRES_PASSWORD=operations_qa_local \
  -e POSTGRES_DB=colombia_sexys_qa \
  -p 127.0.0.1:5433:5432 -d postgres:16-alpine
```

## 2. Variables del backend

En una terminal nueva, desde `backend/`:

```bash
export NODE_ENV=development PORT=4000 WEB_URL=http://localhost:3000
export DATABASE_HOST=127.0.0.1 DATABASE_PORT=5433
export DATABASE_USER=operations_qa DATABASE_PASSWORD=operations_qa_local DATABASE_NAME=colombia_sexys_qa
export JWT_SECRET=local-qa-jwt-secret-000000000000000000000001
export JWT_REFRESH_SECRET=local-qa-refresh-secret-000000000000000000002
export COOKIE_SECRET=local-qa-cookie-secret-000000000000000000003
export DEFAULT_ADMIN_EMAIL=admin.qa@ejemplo.local DEFAULT_ADMIN_PASSWORD=AdminQaLocal-2026
export TELEGRAM_BOT_TOKEN=123456789:dummy-local-no-launch
export R2_ENDPOINT=https://local.invalid R2_ACCESS_KEY_ID=local R2_SECRET_ACCESS_KEY=local
export R2_BUCKET_NAME=local-qa R2_PUBLIC_URL=https://media.local.invalid
corepack pnpm migration:run
QA_LOCAL_SEED=CONFIRM_LOCAL_QA corepack pnpm db:qa:seed
corepack pnpm start:dev
```

El token incluye `dummy`, por lo que Telegraf no inicia polling. R2, Push, IA y Telegram no deben probarse como proveedores reales en este entorno.

## 3. Frontend

En otra terminal, desde `catalogo-cs/`:

```bash
BACKEND_API_URL=http://localhost:4000 \
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=qa_bot \
corepack pnpm dev
```

Abrir `http://localhost:3000/admin`. El mismo login redirige según el rol:

| Rol | Usuario ficticio | Clave local compartida |
|---|---|---|
| Jefe | `demo.jefe1@ejemplo.local` | `QaLocal-2026!` |
| Empleada | `demo.modelo1@ejemplo.local` | `QaLocal-2026!` |
| Chofer | `demo.chofer1@ejemplo.local` | `QaLocal-2026!` |

El seed validado crea dos empleadas vinculadas al jefe, tres clientes, ocho servicios, dos viajes internos y dos externos. Se niega a correr con `NODE_ENV=production`, host remoto, nombre de base sin `qa/test/local/dev`, falta de confirmación o datos demo ya existentes. No borra registros.

## Recorrido mínimo

1. Entrar como jefe y verificar equipo, servicios y conversación histórica.
2. Preparar/asignar un servicio apto para el flujo operativo.
3. Cerrar sesión y entrar como empleada; aceptar y comprobar que no aparece “cobro verificado”.
4. Como jefe, asignar transporte interno; como empleada avanzar en camino, llegada e inicio.
5. En curso, registrar extensión, extra y pánico; comprobar eventos/avisos en UI.
6. Finalizar, preparar regreso, avanzar “estoy de regreso” y completar retorno.
7. Repetir con transporte externo, plataforma, enlace y costo manual.
8. Entrar como chofer y validar oferta/aceptación del viaje interno.

Al terminar, parar la base efímera con `docker stop colombia-sexys-qa-db`; `--rm` elimina solo ese contenedor y sus datos locales.
