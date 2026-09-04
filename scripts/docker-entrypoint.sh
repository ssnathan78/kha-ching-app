#!/bin/sh
set -e
echo "[entrypoint] applying database migrations if present"
node scripts/migrate.mjs || echo "[entrypoint] migrate skipped or already applied"
exec yarn start
