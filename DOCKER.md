# Docker

`docker-compose.yml` runs the app. Postgres and Redis start only with profile `local`:

```bash
COMPOSE_PROFILES=local docker compose up postgres redis
docker compose up app
```

Point `DATABASE_URL` / `REDIS_URL` at `localhost` (or `host.docker.internal` from the app container).

Health: `GET /api/health`.
