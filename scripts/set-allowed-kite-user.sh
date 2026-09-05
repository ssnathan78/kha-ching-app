#!/bin/sh
# Usage: set-allowed-kite-user.sh <kite-user-id>
# Writes ALLOWED_KITE_USER_ID on the Droplet .env. Does not print the value.
set -e
ENVFILE=/srv/khaching/app/.env
VALUE=$1

if [ -z "$VALUE" ] || [ ! -f "$ENVFILE" ]; then
  echo usage_or_env_missing
  exit 1
fi

if grep -qE '^ALLOWED_KITE_USER_ID=' "$ENVFILE"; then
  sed -i "s/^ALLOWED_KITE_USER_ID=.*/ALLOWED_KITE_USER_ID=${VALUE}/" "$ENVFILE"
else
  printf '\nALLOWED_KITE_USER_ID=%s\n' "$VALUE" >> "$ENVFILE"
fi

if grep -qE '^ALLOWED_KITE_USER_ID=.+' "$ENVFILE"; then
  echo FILE=configured
else
  echo FILE=missing
  exit 1
fi
