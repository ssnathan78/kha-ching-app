# Trading risk tests

Automated tests that prove **unsafe behavior is rejected**. They do not prove the strategies are profitable.

## Unit — risk engine (no DB, no Kite)

File: `__tests__/unit/trading/riskEngine.test.ts`

| Case | Asserts |
|------|---------|
| Happy-path mock entry | `{ ok: true }` |
| Qty 0 / fractional / negative | `INVALID_QTY` |
| Live without dual allow | `LIVE_BLOCKED` |
| Live with only env or only setting | `LIVE_BLOCKED` |
| Live with both allows | allowed |
| Desk halted | entry rejected; FLATTEN / SL / EXIT allowed |
| Stale `ltpAt` | `STALE_DATA` |
| LTP 0 | `INVALID_PRICE` |
| Qty 2000 / lots 21 / huge notional | cap codes |
| 12 open positions / 40 working / 20 per minute | caps |
| Flatten still ok at the open-position cap | flatten not gated |
| Duplicate working entry | `DUPLICATE` |
| Job aborted / strategy disabled / market closed | rejected |

## Unit — configuration

File: `__tests__/unit/strategyValidation.test.ts`

| Case | Asserts |
|------|---------|
| `NO_SL` + ASO true | ok |
| `NO_SL` + ASO false | rejected |
| SL exit without ASO | ok |
| Existing unimplemented exits | rejected |
| Lots 101 | rejected |

## Unit — existing strategy guards (still valid)

- `atmStraddle.test.ts` — skew timeout reject; `takeTradeIrrespectiveSkew`; NO_SL skips exit queue; margin fail
- `processExitJob.test.ts` — NO_SL places no exit orders
- `chaseSignal.test.ts` — mocked Kite; does not bypass `placeOrder` in production
- `chaseFill.test.ts` — paper vs live book qty, flatten qty, Paper↔Live switch guard, no status flip on `signal_only` / `other_book_open`
- Ledger: `__tests__/unit/trading/{money,accounting,stateMachine,invariants}.test.ts`

## Simulation — adversarial sequences (all strategies)

Files: `__tests__/simulation/chaseAdversarial.test.ts`, `__tests__/simulation/strategyAdversarial.test.ts`, CORE in `scenarios.test.ts`. Catalog: `lib/simulation/catalog.ts`.

| Scenario | Asserts |
|----------|---------|
| `chase-risk-reject-no-phantom` | `MAX_NOTIONAL`, empty book, status `AWAITING_SIGNAL` |
| `chase-phantom-flatten-no-lots` | No flatten/SL on a rejected entry (lots are not a fallback) |
| `chase-max-lots-reject-no-phantom` | `MAX_LOTS`, empty book |
| `chase-max-positions-no-entry` | `MAX_POSITIONS`, empty book |
| `chase-live-blocked` | `LIVE_BLOCKED`, empty book |
| `chase-halted-no-entry` | `STRATEGY_HALTED`, empty book |
| `chase-paper-to-live-open` | `CHASE_OTHER_BOOK`, live qty 0, no live ENTRY |
| `chase-live-to-paper-open` | `CHASE_OTHER_BOOK`, paper qty 0, no paper ENTRY |
| `straddle-*-` / `strangle-*-` (reject, lots, positions, live-blocked, halted) | Matching risk code, empty book, no flatten |
| `straddle-paper-to-live-open` / `strangle-paper-to-live-open` | `OTHER_BOOK`, live qty 0, paper lot remains |
| `straddle-live-to-paper-open` / `strangle-live-to-paper-open` | `OTHER_BOOK`, paper qty 0, live book remains |
| `straddle-920-one-way-holds-other-leg` / `strangle-920-one-way-holds-other-leg` | CE SL only; PE held until ASO; both flat at end |
| `straddle-920-chop-stops-both-legs` / `strangle-920-chop-stops-both-legs` | SL on both wings; no invented square-off size |

Hermetic 9:20 plan: `__tests__/unit/exitStrategies/individualLegPlan.test.ts` — two independent stops; closing CE leaves PE.

`yarn sim-test` is required after strategy/risk/ledger changes. See [AGENTS.md](../AGENTS.md#adversarial-testing-required--this-is-a-live-desk).

## API

File: `__tests__/api/desk.test.ts`

| Case | Asserts |
|------|---------|
| GET `/api/desk/risk` authenticated | settings payload |
| POST halt / resume | `deskHalted` persists |
| GET `/api/desk/alerts` authenticated | `{ alerts, errorCount, warnCount }` |
| GET anonymous | 401 |
| POST `/api/desk/positions` `clear-phantom` | paper leftover zeros; live with Kite size is 409 |
| Existing portfolio/orders auth | unchanged |

Kill-desk contract tests remain in `__tests__/api/kill-desk.test.ts`.

## Integration

`__tests__/integration/tradingLedger.test.ts` — fill/position invariants. Risk settings row is created by `drizzle/0006_risk_settings.sql` on migrate.

## How to run

Host `node_modules` on Windows may be a Linux install. Prefer Docker:

```bash
docker compose up -d postgres redis
docker run --rm --network kha-ching-app_default -v /c/senthil/kha-ching-app:/app -w /app \
  -e DATABASE_URL=postgresql://postgres:postgres@kha-ching-postgres:5432/trading_db \
  -e REDIS_URL=redis://kha-ching-redis:6379 \
  -e MOCK_ORDERS=true -e TZ=Asia/Kolkata \
  -e SECRET_COOKIE_PASSWORD=test-secret-cookie-password-min-32-chars \
  -e KITE_API_KEY=test_key -e KITE_API_SECRET=test_secret \
  node:22-bookworm bash -c "corepack enable && yarn migrate && yarn unit-test && yarn sim-test && yarn int-test && yarn api-test"
```

If the host install is native Windows: `docker compose up -d postgres redis`, then `yarn migrate && yarn unit-test && yarn sim-test && yarn int-test && yarn api-test`.

CI: lint → unit-test → sim-test → migrate → int-test → api-test → build → e2e.

## Gaps (not yet automated)

- End-to-end Chase SL-breach flatten against a fake Kite
- Concurrent `placeOrder` race (two workers, same tag)
- Redis restart mid-order
- Browser click-path for Desk halt/resume (manual / future Playwright)
