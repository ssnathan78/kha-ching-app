#!/bin/sh
# Print .env key names only. Never prints values.
ENVFILE=${1:-/srv/khaching/app/.env}
awk -F= '
  /^[[:space:]]*#/ { next }
  /^[[:space:]]*$/ { next }
  /^[A-Za-z_][A-Za-z0-9_]*=/ { print $1 }
' "$ENVFILE" | sort
