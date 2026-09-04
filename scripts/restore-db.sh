#!/usr/bin/env bash
# Restore a gzipped pg_dump. MANUAL: stop the app first.
set -euo pipefail

DUMP="${1:-}"
if [[ -z "$DUMP" ]]; then
  echo "Usage: $0 backups/trading_db-YYYYMMDD-HHMMSS.sql.gz" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
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

gunzip -c "$DUMP" | psql "$DATABASE_URL"
echo "Restore finished"
