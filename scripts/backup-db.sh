#!/usr/bin/env bash
# AUTOMATED (when run from cron): dump Postgres to ./backups
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
mkdir -p "$BACKUP_DIR"

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is not set" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$BACKUP_DIR/trading_db-$STAMP.sql.gz"
pg_dump "$DATABASE_URL" | gzip > "$FILE"
echo "Wrote $FILE"

# Keep 14 days of local dumps
find "$BACKUP_DIR" -name "trading_db-*.sql.gz" -mtime +14 -delete
