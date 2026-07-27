#!/usr/bin/env bash
set -Eeuo pipefail

if [[ $# -ne 1 ]]; then
  echo "Uso: $0 COMMIT_SHA" >&2
  exit 64
fi

COMMIT_SHA="$1"
PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

cd "$PROJECT_DIR"
git fetch --prune origin main
git cat-file -e "${COMMIT_SHA}^{commit}"
git checkout --detach "$COMMIT_SHA"

docker compose config --quiet
docker compose build
docker compose up -d --wait db

if docker compose exec -T db pg_isready >/dev/null 2>&1; then
  "$PROJECT_DIR/scripts/backup-postgres.sh" daily
fi

docker compose run --rm --no-deps backend \
  node node_modules/typeorm/cli.js migration:run -d dist/data-source.js
docker compose up -d --wait --remove-orphans backend frontend

curl --fail --silent --show-error http://127.0.0.1:3001/api/health >/dev/null
docker compose ps
echo "Despliegue completado en ${COMMIT_SHA}."
