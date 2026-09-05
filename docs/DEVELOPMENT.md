# Development (without Docker, or mixed)

Use this if you want the Next.js dev server and hot reload on your machine. You still need **Postgres** and **Redis** running (Docker can run *only* those two).

## Prerequisites

- **Node.js ≥ 22.13** (required by iron-session 9)
- **Yarn Berry 4.9.1** — pinned in `package.json` / `.yarn/releases/`; `yarn install --immutable`
- Postgres 16 and Redis 7
- `TZ=Asia/Kolkata` in your shell or `.env`

Check:

```bash
node -v    # v22.13+
yarn -v    # 4.x (via .yarn/releases/yarn-4.9.1.cjs)
```

## Env file

```bash
cp .env.example .env
```

For host-run app + Dockerized DB:

```bash
docker compose up -d postgres redis
```

Keep `.env` pointed at published ports for host-run tools:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/trading_db
REDIS_URL=redis://127.0.0.1:6379
```

If `.env` uses docker-internal hostnames (`@db:`, `@postgres:`, `redis://redis:`) for a full compose stack, **Jest tests still work on the host** — see [TESTING_STRATEGY.md](./TESTING_STRATEGY.md#running-tests-with-docker) (`__tests__/loadEnv.js` rewrites them for test runs).

## Install, schema, run

```bash
yarn install --immutable
yarn migrate          # or yarn drizzle:push in a throwaway DB
yarn dev
```

Open http://127.0.0.1:3000. Set kite.trade redirect to the same path as Docker.

`yarn dev` is `node --require ./otel.js server.js` (custom server, not `next dev` alone).

## Tests

Full Docker + host instructions: **[TESTING_STRATEGY.md § Running tests with Docker](./TESTING_STRATEGY.md#running-tests-with-docker)**.

Short version:

```bash
docker compose up -d postgres redis
yarn install --immutable
yarn migrate
yarn unit-test        # Hermetic — no broker, no DB
yarn int-test         # Postgres constraints, job lifecycle
yarn api-test         # All API route contracts (+ Redis)
yarn build
yarn playwright install chromium   # once
yarn e2e-test         # app on :3000 (compose or yarn start)
yarn test             # unit + int + api
yarn lint
```

Unit tests: `__tests__/unit/`. Shared helpers: `__tests__/support/`.

E2E uses Playwright with `MOCK_ORDERS=true` and sealed session cookies — see [TESTING_STRATEGY.md](./TESTING_STRATEGY.md).

## Changing the database schema

1. Edit `lib/schema.ts`.
2. `yarn drizzle:generate` writes SQL under `drizzle/`.
3. Read the SQL. Commit it.
4. `yarn migrate` applies it.

`yarn drizzle:push` applies the schema without a SQL file. Fine on a local empty DB; risky on production.

Trading ledger tables land in `drizzle/0004_trading_ledger.sql`. Historical `transactions` are copied into orders/fills by `0005_trading_history_backfill.sql` (idempotent; original rows stay). Positions are rebuilt by applying unapplied fills on first Desk reconcile. See [TRADING_DOMAIN_MODEL.md](./TRADING_DOMAIN_MODEL.md).

## Code style

Biome (`biome.json`): 100 columns, 2-space indent. Husky may run `biome check` on commit.

## Queues while developing

Bull Board: http://127.0.0.1:3000/queues (must be logged in). Queue names are suffixed with your `KITE_API_KEY` so two developers on one Redis do not collide if they use different keys.

## Do not

- Run `npm install` (creates `package-lock.json`; this repo uses Yarn Berry).
- Set `MOCK_ORDERS=false` against a funded account “just to see”. Live also requires Desk → Risk “Allow live orders”.
- Log `access_token` or return it from `/api/user`.

See also [CODEBASE_MODERNIZATION.md](CODEBASE_MODERNIZATION.md) for post-upgrade patterns and [TESTING_STRATEGY.md](TESTING_STRATEGY.md) for the Docker test checklist.
