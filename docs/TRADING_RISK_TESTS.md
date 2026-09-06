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
| Daily loss −50k / drawdown 15% | halt codes; flatten still ok |
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
- Ledger: `__tests__/unit/trading/{money,accounting,stateMachine,invariants}.test.ts`

## API

File: `__tests__/api/desk.test.ts`

| Case | Asserts |
|------|---------|
| GET `/api/desk/risk` authenticated | settings payload |
| POST halt / resume | `deskHalted` persists |
| GET `/api/desk/alerts` authenticated | `{ alerts, errorCount, warnCount }` |
| GET anonymous | 401 |
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
  node:22-bookworm bash -c "corepack enable && yarn migrate && yarn unit-test && yarn int-test && yarn api-test"
```

If the host install is native Windows: `docker compose up -d postgres redis`, then `yarn migrate && yarn unit-test && yarn int-test && yarn api-test`.

CI: lint → unit-test → migrate → int-test → api-test → build → e2e.

## Gaps (not yet automated)

- End-to-end Chase SL-breach flatten against a fake Kite
- Concurrent `placeOrder` race (two workers, same tag)
- Redis restart mid-order
- Browser click-path for Desk halt/resume (manual / future Playwright)
