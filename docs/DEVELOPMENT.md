# Development (without Docker, or mixed)

Use this if you want the Next.js dev server and hot reload on your machine. You still need **Postgres** and **Redis** running (Docker can run *only* those two).

## Prerequisites

- **Node.js 20** (this app will not run on Node 14)
- **Yarn Classic 1.22.22** — `corepack enable && corepack prepare yarn@1.22.22 --activate`
- Postgres 16 and Redis 7
- `TZ=Asia/Kolkata` in your shell or `.env`

Check:

```bash
node -v    # v20.x
yarn -v    # 1.22.22
```

If `package.json` says `packageManager: yarn@1.22.22` and your global Yarn is 4.x, installs will fail. Use Corepack as above.

## Env file

```bash
cp .env.example .env
```

For host-run app + Dockerized DB:

```bash
docker compose up -d postgres redis
```

Keep `.env` `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/trading_db` and `REDIS_URL=redis://127.0.0.1:6379`.

## Install, schema, run

```bash
yarn install --frozen-lockfile
yarn migrate          # or yarn drizzle:push in a throwaway DB
yarn dev
```

Open http://127.0.0.1:3000. Set kite.trade redirect to the same path as Docker.

`yarn dev` is `node --require ./otel.js server.js` (custom server, not `next dev` alone).

## Tests

```bash
yarn unit-test        # no live broker
yarn lint
yarn build            # same TypeScript check CI uses
```

Unit tests live in `__tests__/unit/`. They cover rupee vs points P&amp;L, stop-loss order helpers, and instrument helpers.

`yarn int-test` needs DB/Redis and is optional.

## Changing the database schema

1. Edit `lib/schema.ts`.
2. `yarn drizzle:generate` writes SQL under `drizzle/`.
3. Read the SQL. Commit it.
4. `yarn migrate` applies it.

`yarn drizzle:push` applies the schema without a SQL file. Fine on a local empty DB; risky on production.

## Code style

Biome (`biome.json`): 100 columns, 2-space indent. Husky may run `biome check` on commit.

## Queues while developing

Bull Board: http://127.0.0.1:3000/queues (must be logged in). Queue names are suffixed with your `KITE_API_KEY` so two developers on one Redis do not collide if they use different keys.

## Do not

- Run `npm install` (creates `package-lock.json`; this repo uses Yarn).
- Set `MOCK_ORDERS=false` against a funded account “just to see”.
- Log `access_token` or return it from `/api/user`.
