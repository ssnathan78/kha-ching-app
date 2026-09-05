#!/bin/sh
# Reports presence only. Never prints secret values.
envfile=/srv/khaching/app/.env
if [ -f "$envfile" ] && grep -qE '^ALLOWED_KITE_USER_ID=.+' "$envfile"; then
  echo FILE=configured
elif [ -f "$envfile" ] && grep -qE 'ALLOWED_KITE_USER_ID' "$envfile"; then
  echo FILE=commented-or-empty
else
  echo FILE=missing
fi

docker exec kha-ching-app node -e "const v=process.env.ALLOWED_KITE_USER_ID; console.log(v && String(v).trim() ? 'CONTAINER=configured' : 'CONTAINER=missing')"
