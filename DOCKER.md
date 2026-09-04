# Docker

## Default (what you want locally)

```bash
cp .env.example .env
# fill Kite keys, SECRET_COOKIE_PASSWORD, keep MOCK_ORDERS=true
docker compose up --build
```

This starts **postgres**, **redis**, and **app** (production image).

Inside the app container, compose sets:

- `DATABASE_URL=postgresql://postgres:postgres@postgres:5432/trading_db`
- `REDIS_URL=redis://redis:6379`
- `NODE_ENV=production` (matches the prebuilt Next.js output)
- `SESSION_COOKIE_SECURE=false` (HTTP cookies on 127.0.0.1)
- `MOCK_ORDERS=true`
- `TZ=Asia/Kolkata`

Health: http://127.0.0.1:3000/api/health

First boot runs migrations (creates tables if the volume is empty).

## Images

`Dockerfile` stages:

- **builder** — Yarn 1.22.22 via Corepack, `yarn install`, `yarn build`
- **production** — copies `.next`, `node_modules`, `lib`, `pages`, `drizzle`, `scripts`
- **dev** — `yarn install` + `yarn dev` (compose profile `dev`)

Windows checkouts can save `.sh` files with CRLF. The production stage strips `\r` so Alpine `sh` accepts `set -e`.

## Data

Named volumes `postgres_data` and `redis_data` survive `docker compose down`.  
`docker compose down -v` **deletes** the database.

## Only databases

```bash
docker compose up -d postgres redis
```

Then run `yarn dev` on the host (see `docs/DEVELOPMENT.md`).

## Full walkthrough

`docs/LOCAL.md`.
