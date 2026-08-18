# Colombia Sexys

Monorepo de producción para el catálogo público, panel administrativo y
operación interna. Incluye:

- `catalogo-cs`: Next.js 15 y React 19.
- `backend`: NestJS 11, TypeORM y PostgreSQL.
- PostgreSQL 16 administrado por Docker Compose.
- Cloudflare R2 para imágenes, Telegram e integración opcional con Groq.

## Requisitos

- Node.js 20.
- pnpm 10.34.0 mediante Corepack.
- Docker Engine y Docker Compose v2.

```bash
corepack enable
corepack prepare pnpm@10.34.0 --activate
pnpm install --frozen-lockfile
```

## Variables de entorno
l
Hay tres plantillas:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp catalogo-cs/.env.example catalogo-cs/.env.local
```

Reemplaza todos los valores `REEMPLAZAR_*`. Genera secretos diferentes:

```bash
openssl rand -base64 48
```

En Docker, `BACKEND_API_URL` debe ser `http://backend:4000`. Para desarrollo
local sin Docker debe ser `http://localhost:4000`.

Los archivos reales `.env` no se confirman en Git.

## Desarrollo y validación

```bash
pnpm dev:backend
pnpm dev:frontend
pnpm lint
pnpm test
pnpm build
pnpm check
```

Para publicar PostgreSQL y backend sólo en loopback durante desarrollo:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db backend
```

## Producción con Docker

El Compose de producción:

- No publica PostgreSQL.
- No publica NestJS.
- Expone Next.js únicamente en `127.0.0.1:3001`.
- Espera healthchecks antes de iniciar servicios dependientes.
- Conserva PostgreSQL en `colombia_sexys_postgres_data`.

```bash
docker compose config --quiet
docker compose build
docker compose up -d --wait db
docker compose run --rm --no-deps backend \
  node node_modules/typeorm/cli.js migration:run -d dist/data-source.js
docker compose up -d --wait backend frontend
docker compose ps
```

Nunca ejecutes `docker compose down -v`: eliminaría el volumen de PostgreSQL.

## Salud

- Backend liveness: `GET /health/live`.
- Backend readiness con PostgreSQL: `GET /health/ready`.
- Frontend: `GET /api/health`.

Desde el VPS:

```bash
curl --fail http://127.0.0.1:3001/api/health
docker compose exec -T backend wget -qO- http://127.0.0.1:4000/health/ready
```

## Migrar PostgreSQL desde otro VPS

1. Comprueba versiones en origen y destino:

   ```bash
   pg_dump --version
   docker compose exec db postgres --version
   ```

2. Detén temporalmente las escrituras en el origen y genera el corte:

   ```bash
   pg_dump --format=custom --no-owner --no-acl \
     --dbname='CONNECTION_STRING_ORIGEN' \
     --file=colombia-sexys-cutover.dump
   sha256sum colombia-sexys-cutover.dump \
     > colombia-sexys-cutover.dump.sha256
   ```

3. Transfiere ambos archivos:

   ```bash
   scp colombia-sexys-cutover.dump* usuario@VPS_NUEVO:/tmp/
   ```

4. En el VPS nuevo, con los contenedores de aplicación aún detenidos:

   ```bash
   cd /opt/colombia-sexys
   ./scripts/restore-postgres.sh /tmp/colombia-sexys-cutover.dump --confirm
   docker compose run --rm --no-deps backend \
     node node_modules/typeorm/cli.js migration:run -d dist/data-source.js
   ```

5. Compara conteos de tablas críticas, inicia la aplicación y conserva el VPS
   anterior hasta completar la aceptación.

## Backups

Los scripts crean dumps custom, checksum SHA-256, bloqueo contra ejecuciones
simultáneas y rotación:

```bash
sudo PROJECT_DIR=/opt/colombia-sexys \
  BACKUP_ROOT=/var/backups/colombia-sexys \
  ./scripts/backup-postgres.sh daily
```

Instala la programación de 7 diarios y 4 semanales:

```bash
sudo install -m 644 deploy/cron/colombia-sexys-backup \
  /etc/cron.d/colombia-sexys-backup
```

Estos backups permanecen en el mismo VPS y no protegen frente a pérdida total
del servidor. Deben migrarse a almacenamiento externo en una segunda fase.

Prueba una restauración antes del lanzamiento usando una base temporal o una
ventana controlada. `restore-postgres.sh` reemplaza el contenido actual.

## Nginx y dominio

Primero audita el VPS:

```bash
docker ps --format 'table {{.Names}}\t{{.Ports}}'
docker compose ls
sudo ss -lntp
sudo nginx -T
```

Cuando exista dominio, sustituye `APP_DOMAIN` en
`deploy/nginx/colombia-sexys.conf.template`, instala el archivo como un virtual
host independiente, y valida antes de recargar:

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d APP_DOMAIN
```

No reinicies ni elimines la aplicación que ya ocupa el VPS.

## GitHub Actions

`CI` valida pull requests y `main` con instalación congelada, lint, pruebas,
build y Compose. Tras un CI exitoso en `main`, `Deploy production` se conecta
por SSH y despliega el commit validado.

Configura estos secretos:

- `VPS_HOST`
- `VPS_PORT`
- `VPS_USER`
- `VPS_SSH_KEY`
- `VPS_PROJECT_PATH`, normalmente `/opt/colombia-sexys`

El VPS conserva las variables de aplicación; no se almacenan en GitHub.
El usuario SSH necesita acceso a Docker, al repositorio y al directorio de
backups.

El despliegue crea un backup antes de migrar. Si una migración falla, no
actualiza backend/frontend ni intenta revertir automáticamente la base.

## Rollback y diagnóstico

Para volver al código anterior sin revertir migraciones:

```bash
git log --oneline -n 10
./scripts/deploy.sh COMMIT_ANTERIOR
```

Antes del rollback verifica que el código anterior sea compatible con el
esquema ya migrado.

Diagnóstico:

```bash
docker compose ps
docker compose logs --tail=200 db backend frontend
docker inspect colombia_sexys_postgres_data
df -h
free -h
```
