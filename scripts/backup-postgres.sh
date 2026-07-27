#!/usr/bin/env bash
set -Eeuo pipefail

MODE="${1:-daily}"
case "$MODE" in
  daily) KEEP=7 ;;
  weekly) KEEP=4 ;;
  *)
    echo "Uso: $0 [daily|weekly]" >&2
    exit 64
    ;;
esac

PROJECT_DIR="${PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/colombia-sexys}"
TARGET_DIR="${BACKUP_ROOT}/${MODE}"
LOCK_FILE="${BACKUP_ROOT}/backup.lock"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FINAL_FILE="${TARGET_DIR}/postgres-${TIMESTAMP}.dump"
TEMP_FILE="${FINAL_FILE}.tmp"

mkdir -p "$TARGET_DIR"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Ya existe otro backup en ejecucion." >&2
  exit 75
fi

cd "$PROJECT_DIR"
trap 'rm -f "$TEMP_FILE"' EXIT

docker compose exec -T db sh -c \
  'exec pg_dump --format=custom --no-owner --no-acl --username="$POSTGRES_USER" "$POSTGRES_DB"' \
  >"$TEMP_FILE"

test -s "$TEMP_FILE"
mv "$TEMP_FILE" "$FINAL_FILE"
sha256sum "$FINAL_FILE" >"${FINAL_FILE}.sha256"

mapfile -t OLD_BACKUPS < <(
  find "$TARGET_DIR" -maxdepth 1 -type f -name 'postgres-*.dump' -printf '%T@ %p\n' \
    | sort -rn \
    | tail -n "+$((KEEP + 1))" \
    | cut -d' ' -f2-
)

for backup in "${OLD_BACKUPS[@]}"; do
  rm -f -- "$backup" "${backup}.sha256"
done

echo "Backup creado: $FINAL_FILE"
