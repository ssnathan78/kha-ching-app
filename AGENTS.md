# Agent notes (Kha-Ching)

This file is for coding agents (Cursor, Claude, etc.). Humans should start at [README.md](README.md).

## Non-negotiables

- Personal live-trading app for **Indian** index options via **Zerodha Kite**.
- **Yarn Berry 4** (`packageManager` in `package.json`, pinned release in `.yarn/releases/`). Uses `nodeLinker: node-modules` in `.yarnrc.yml` (not PnP). Install with `yarn install --immutable` in CI/Docker.
- `MOCK_ORDERS=true` unless the operator asked for live orders. Live also needs Desk → Risk “Allow live orders”. Risk caps live in the DB, not in `.env`.
- Do not change **strategy points** in `lib/targetPnL.ts` to rupee-weighted P&amp;L. The UI shows **both** rupees and points on purpose (`lib/pnl.ts`).
- Do not commit `.env` or tokens.
- Timezone is **Asia/Kolkata**.
- New code: TypeScript. Linter: **Biome** (`yarn lint`), not ESLint.

## How the process boots

`server.js` is the real entrypoint (`yarn dev` / `yarn start`). It mounts Next.js and Bull Board at `/queues`. Do not recommend `next start` alone — workers would not start the same way.

API session helper `lib/session.ts` **side-imports** queue processors, exit strategies, and watchers so workers start with the web process.

## Docker

- Default compose target is **production** image + `NODE_ENV=production` + `SESSION_COOKIE_SECURE=false` + `MOCK_ORDERS=true` for local HTTP.
- Entrypoint: `scripts/docker-entrypoint.sh` → `yarn migrate` → `yarn start`.
- First-time schema: `drizzle/0000_init.sql`, `drizzle/0000_integrity.sql`, then `drizzle/0001_plan_uniqueness_and_defaults.sql`.

## Tests

```bash
yarn unit-test   # Hermetic tests (no Kite session)
yarn sim-test    # Deterministic market simulation (no Kite, injected clock)
yarn simulate -- --scenario normal-day
yarn int-test    # Postgres integration (needs DATABASE_URL)
yarn api-test    # API route contracts
yarn e2e-test    # Playwright (needs build + Postgres/Redis)
yarn live-test   # Optional; needs USER_SESSION against Kite
```

**Docker:** start `docker compose up -d postgres redis`, then run Jest on the host. See [docs/TESTING_STRATEGY.md](docs/TESTING_STRATEGY.md#running-tests-with-docker) for the full checklist, `.env` hostname mapping, and E2E options.

CI runs lint, unit-test, sim-test, migrate, int-test, api-test, build, Playwright e2e-test. Do not put Kite live tests under `__tests__/unit`. Simulation must keep `SIMULATION=true` and `MOCK_ORDERS=true` — it must never call Kite.

## Adversarial testing (required — this is a live desk)

Treat every change as if it can lose real money. Happy-path tests are not enough. Before you finish work on **orders, risk, ledger provenance, Chase, straddle, strangle, or a new strategy**:

1. List sequences of events × configs that can leave a **phantom status**, mix **paper and live books**, flatten **the wrong size**, or **open** a position while trying to exit.
2. Encode those sequences as named scenarios in `lib/simulation/catalog.ts` with assertions that fail if the bug returns. Add outcome checks in `__tests__/simulation/` (see `chaseAdversarial.test.ts`, `strategyAdversarial.test.ts`, and CORE in `scenarios.test.ts`). Every strategy in `RISK_STRATEGY_KEYS` needs the reject-without-fill and paper↔live matrix, not only Chase.
3. Put hermetic matrices in `__tests__/unit/` (book qty, fill decisions, risk codes). Do not rely on a one-off REPL.
4. Run `yarn unit-test` and `yarn sim-test`. If you touched Desk Risk or ledger writes, also `yarn api-test` / `yarn int-test` when Postgres is up.

**Minimum sequences to consider** (add a case if the change can hit that path):

| Sequence | Must not happen |
|---|---|
| Entry rejected (`MAX_NOTIONAL`, `MAX_LOTS`, `MAX_POSITIONS`, `LIVE_BLOCKED`, halt, pause, lots=0) | Strategy status LONG/SHORT (or equivalent) with an empty book; later HOLD that skips a real signal |
| SL / flatten when the **active** book is flat | Qty falling back to configured lots (that **opens** a new position) |
| Paper ↔ Live (or MOCK ↔ live) while a book is open | Treating the other book as a fill; sending a live flatten that opens Kite size; stacking a second book |
| New entry while the other provenance still has size | Punching the new book (`CHASE_OTHER_BOOK` / `OTHER_BOOK`) |
| Halt / trading-disabled / strategy-disabled | Blocking flatten/SL when those roles must still work (except strategy **disabled**, which is fully dark) |
| Restart, duplicate working order, partial fill, gap through stop | Overfill, double entry, or status that disagrees with ledger qty |

**New or changed strategy:** add it to `RISK_STRATEGY_KEYS` and Desk → Risk; add a sim **actor** that reuses production `evaluateOrder` (do not invent a second entry rule); add catalog cases for reject-without-phantom-status, paper↔live with an open book, flatten-empty-book, and halt vs flatten. Spec: [docs/strategies/README.md](docs/strategies/README.md). Sim how-to: [docs/TRADING_SIMULATION_GUIDE.md](docs/TRADING_SIMULATION_GUIDE.md).

Replay: `yarn simulate -- --scenario chase-paper-to-live-open` or `straddle-paper-to-live-open` / `strangle-paper-to-live-open` (print seed on failure).

## Docs to update when you change behaviour

Login/cookies → `docs/LOCAL.md`, `docs/TROUBLESHOOTING.md`.  
Queues/schema → `docs/ARCHITECTURE.md`.  
Ship to a server → `docs/DEPLOYMENT.md`.  
Security → `docs/SECURITY_REVIEW.md`, `docs/SECURITY_FINDINGS.md`.  
Commands/stack → `CLAUDE.md` and this file.

Longer project map: [CLAUDE.md](CLAUDE.md).

Modernization patterns and backlog: [docs/CODEBASE_MODERNIZATION.md](docs/CODEBASE_MODERNIZATION.md).

Strategy specs (straddle, strangle, Chase) and rule-book vs chase-bot vs this app: [docs/strategies/README.md](docs/strategies/README.md).

Trading ledger (orders, fills, positions, trades, recon): [docs/TRADING_DOMAIN_MODEL.md](docs/TRADING_DOMAIN_MODEL.md). Do not collapse signal / order / fill / position / trade into one row.

Trading risk: [docs/TRADING_RISK_AUDIT.md](docs/TRADING_RISK_AUDIT.md). Pre-trade limits live in `lib/trading/riskEngine.ts` and cannot be bypassed by strategy code.

Market simulation (clock, calendar, simulated exchange, scenario catalog): [docs/TRADING_SIMULATION_GUIDE.md](docs/TRADING_SIMULATION_GUIDE.md). Do not treat it as a PnL backtester.

Production Droplet: [docs/SSH.md](docs/SSH.md) (any agent) and [docs/PRODUCTION_RUNBOOK.md](docs/PRODUCTION_RUNBOOK.md). SSH via laptop `Host kha-ching-prod` only. Read-only until the operator approves a change. Never place, cancel, or change a live order without explicit confirmation. Do not print `.env` or BullMQ queue names (they include `KITE_API_KEY`).
