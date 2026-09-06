# kha-ching

Personal algorithmic trading app for Indian markets via Zerodha Kite Connect.

## Tech stack

- **Framework:** Next.js 16 (Pages Router + API routes), React 19, Material-UI 9
- **Language:** TypeScript 5 (mixed JS/TS). Prefer TypeScript for new files.
- **Database:** PostgreSQL via Drizzle ORM (`lib/drizzle.ts`, `lib/schema.ts`)
- **Queue:** BullMQ 6 with IORedis 6 (`lib/queue.ts`, `lib/queue-processor/`)
- **Broker:** Zerodha Kite Connect (`lib/kiteUtils.ts`)
- **Auth:** iron-session encrypted cookie `khaching-kite-session` (`lib/session.ts`)
- **Observability:** OpenTelemetry → optional Grafana Cloud (`otel.js`)
- **Server:** Express (`server.js`) with Bull Board at `/queues`
- **Package manager:** Yarn Berry **4.9.1** (`.yarn/releases/`, `nodeLinker: node-modules` in `.yarnrc.yml`). Use `yarn`, not `npm`.

## Commands

```bash
yarn dev              # Dev server (OTEL required via node --require)
yarn build            # Production Next.js build
yarn migrate          # Apply SQL in drizzle/
yarn start            # Production server (TZ=Asia/Kolkata)
yarn lint             # Biome
yarn format           # Biome write
yarn test             # unit + sim + int + api
yarn unit-test        # Hermetic unit tests (no Kite)
yarn sim-test         # Market simulation (injected clock, no Kite)
yarn simulate -- --scenario normal-day
yarn int-test         # Postgres integration
yarn api-test         # API contract tests
yarn e2e-test         # Playwright E2E (after build)
yarn test:coverage    # Coverage summary
yarn live-test        # Optional; needs USER_SESSION
yarn drizzle:generate
yarn drizzle:push
yarn queues           # Standalone Bull Board script
```

**Tests with Docker:** `docker compose up -d postgres redis`, then `yarn migrate` and Jest on the host. Details: [docs/TESTING_STRATEGY.md](docs/TESTING_STRATEGY.md#running-tests-with-docker).

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
| `trade_plans` | Saved weekday templates (one per strategy per day) |
| `chase_settings` | Single Chase plan (lots, EMA, buffer, pause) |
| `job_executions` | Job lifecycle (audit; not deleted by daily cleanup) |
| `transactions` | Completed Kite orders (`order_id` unique) |
| `accesstoken` | Today's access token |
| `ema` / `chase_status` / `chase_log` | Chase strategy |
| `strategy_signals` | Persisted Chase/skew/strike evaluations (Desk → Signals) |
| `operator_feed_clears` | Hide Alerts without deleting ledger/audit |

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

`__tests__/unit/` — hermetic (pnl, EMA, Chase defaults, cookies, help). `__tests__/integration/` — Postgres. `__tests__/live/` — Kite session, not CI.

Run int/api/e2e with Docker deps: [docs/TESTING_STRATEGY.md](docs/TESTING_STRATEGY.md#running-tests-with-docker).

## Domain

- Nifty, BankNifty, FinNifty options. `hasWeeklyExpiry` is **Nifty only**.
- Lot sizes (Jan 2026 NSE): Nifty 65, BankNifty 30, FinNifty 60.
- Dual P&amp;L: rupees in UI; points for `targetPnL` (do not merge them).

## File map

```
lib/           schema, queues, strategies, Kite, session, clock, marketCalendar
lib/trading/   ledger + independent risk engine (riskEngine, riskGate, riskSettings)
lib/simulation/ market/broker/scenario runner (no live Kite)
pages/         UI + API routes (including /desk and /api/desk/risk)
components/    strategy forms and shared UI
types/         trade / plan / kite types
drizzle/       SQL migrations (0004+ trading ledger)
scripts/       migrate, docker-entrypoint, backups, production-health-check
docs/          TRADING_*, PRODUCTION_*, SSH.md (any agent → Droplet)
```
