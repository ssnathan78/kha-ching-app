# kha-ching

Personal algorithmic trading app for Indian markets via Zerodha Kite Connect.

## Tech stack

- **Framework:** Next.js 16 (Pages Router + API routes), React 18, Material-UI 5
- **Language:** TypeScript 5 (mixed JS/TS). Prefer TypeScript for new files.
- **Database:** PostgreSQL via Drizzle ORM (`lib/drizzle.ts`, `lib/schema.ts`)
- **Queue:** BullMQ 5 with IORedis (`lib/queue.ts`, `lib/queue-processor/`)
- **Broker:** Zerodha Kite Connect (`lib/kiteUtils.ts`)
- **Auth:** iron-session encrypted cookie `khaching-kite-session` (`lib/session.ts`)
- **Observability:** OpenTelemetry → optional Grafana Cloud (`otel.js`)
- **Server:** Express (`server.js`) with Bull Board at `/queues`
- **Package manager:** Yarn Classic **1.22.22** (`yarn.lock` is v1). Use `yarn`, not `npm`.

## Commands

```bash
yarn dev              # Dev server (OTEL required via node --require)
yarn build            # Production Next.js build
yarn migrate          # Apply SQL in drizzle/
yarn start            # Production server (TZ=Asia/Kolkata)
yarn lint             # Biome
yarn format           # Biome write
yarn test             # Jest
yarn unit-test        # Unit only
yarn int-test         # Integration (needs DB/Redis)
yarn drizzle:generate
yarn drizzle:push
yarn queues           # Standalone Bull Board script
```

## Architecture (queues)

Defined in `lib/queue.ts`:

- **tradingQueue** — entry orders (`lib/queue-processor/tradingQueue.ts`)
- **exitTradingQueue** — exit / SL (`lib/queue-processor/exitTradingQueue.ts`)
- **ancillaryQueue** — orderbook sync (`lib/queue-processor/ancillaryQueue.ts`)
- **targetPnLQueue** — profit/loss targets (`lib/queue-processor/targetPnLQueue.ts`)
- **squareOffQueue** — time square-off (`lib/queue-processor/squareOffQueue.js`)
- **chaseQueue** — Subscribe & Chase (`lib/queue-processor/chaseQueue.ts`)

## Database (`lib/schema.ts`)

| Table | Role |
|---|---|
| `trade_plans` | Saved weekday templates |
| `job_executions` | Job lifecycle (audit; not deleted by daily cleanup) |
| `transactions` | Completed Kite orders (`order_id` unique) |
| `accesstoken` | Today's access token |
| `ema` / `chase_status` / `chase_log` | Chase strategy |

Helpers: `lib/drizzleDbUtils.ts`. Init SQL: `drizzle/0000_init.sql`.

## Strategies

- `lib/strategies/atmStraddle.ts`
- `lib/strategies/strangle.ts`

Exits: `lib/exit-strategies/`. Watchers: `lib/watchers/`.

## Environment

Copy `.env.example` → `.env`. Required: `DATABASE_URL`, `REDIS_URL`, `KITE_API_KEY`, `KITE_API_SECRET`, `SECRET_COOKIE_PASSWORD` (≥32 chars), `TZ=Asia/Kolkata`. Local HTTP: `SESSION_COOKIE_SECURE=false`. Compose overrides DB/Redis hostnames.

## Docker

```bash
docker compose up --build
```

Health: `GET /api/health`.

## Tests

`__tests__/unit/` — pnl, SL orders, instruments. Setup: `__tests__/setupEnv.ts`.

## Domain

- Nifty, BankNifty, FinNifty options. `hasWeeklyExpiry` is **Nifty only**.
- Lot sizes (Jan 2026 NSE): Nifty 65, BankNifty 30, FinNifty 60.
- Dual P&amp;L: rupees in UI; points for `targetPnL` (do not merge them).

## File map

```
lib/           schema, queues, strategies, Kite, session
pages/         UI + API routes
components/    strategy forms and shared UI
types/         trade / plan / kite types
drizzle/       SQL migrations
scripts/       migrate, docker-entrypoint, backups
```
