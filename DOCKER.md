# Docker

Postgres, Redis, and the app start together:

```bash
cp .env.example .env   # add Kite keys
docker compose up --build
```

The app container uses `DATABASE_URL`/`REDIS_URL` pointing at the `postgres` and `redis` services. `MOCK_ORDERS=true` and `NODE_ENV=development` are set in compose so login works over HTTP and orders are not sent to the exchange.

See `docs/LOCAL.md`.
