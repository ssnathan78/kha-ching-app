#!/bin/sh
set -e
echo "[entrypoint] applying database migrations"
node scripts/migrate.mjs
exec yarn start
