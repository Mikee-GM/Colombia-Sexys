#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 2 || "$2" != "--confirm" ]]; then
  echo "Uso: $0 /ruta/backup.dump --confirm" >&2
  echo "La restauracion reemplaza el contenido actual de la base." >&2
  exit 64
fi

DUMP_FILE="$(realpath "$1")"
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

test -s "$DUMP_FILE"
if [[ -f "${DUMP_FILE}.sha256" ]]; then
  (cd "$(dirname "$DUMP_FILE")" && sha256sum --check "$(basename "${DUMP_FILE}.sha256")")
fi

cd "$PROJECT_DIR"
docker compose stop frontend backend 2>/dev/null || true
docker compose up -d --wait db
docker compose exec -T db sh -c \
  'exec pg_restore --clean --if-exists --no-owner --no-acl --exit-on-error --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
  <"$DUMP_FILE"

echo "Restauracion terminada: $DUMP_FILE"
