# Trading simulation guide

## What it is

A reusable clock + calendar + market + broker + risk + book that lets you fast-forward through sessions, weekends, gaps, broker faults, and restarts. The three live strategies are exercised through **actors** that reuse production conditions (`chaseTolerances`, `evaluateOrder`, `isMarketOpen`). They do not invent new entry rules.

## Commands

```bash
yarn sim-test                 # deterministic + seeded property suite (CI)
yarn simulate -- --list
yarn simulate -- --scenario normal-day
yarn simulate -- --scenario flash-crash --seed 12345
yarn simulate -- --scenario weekend
yarn simulate -- --scenario random --seed 12345
```

`yarn simulate` is a thin CLI over the same `simulate()` function the tests call. Use Yarn, not npm.

CI runs `yarn sim-test` after unit tests. It does not call Kite, and it does not use the wall clock for market hours.

## How simulated time works

```ts
import { SimClock, setClock, resetClock } from "../lib/clock"
import { isMarketOpen } from "../lib/utils"

const clock = new SimClock("2026-09-07 08:00")
setClock(clock)
isMarketOpen() // false
clock.jumpToMarketOpen()
clock.add(1, "second")
isMarketOpen() // true (session start is exclusive at 09:15:00)
clock.jumpToNextTradingDay()
resetClock()
```

Jumps skip weekends and holidays. Pause/resume freeze `add()`.

## How to create a scenario

```ts
import { simulate } from "../lib/simulation"

const result = simulate({
  scenario: "custom-week",
  start: "2026-09-07 09:00",
  end: "2026-09-11 18:00",
  seed: 12345,
  instruments: [{ symbol: "NIFTY26SEPFUT", lotSize: 65, startPrice: 25000 }],
  pricePath: "flash_crash",
  volatility: "high",
  liquidity: "low",
  slippage: { mode: "fixed", points: 1 },
  stepMinutes: 15,
  actors: [
    { kind: "straddle", strategy: "ATM_STRADDLE", symbol: "NIFTY26SEPFUT", lots: 1, fireAt: "09:20" },
    { kind: "chase", strategy: "CHASE", symbol: "NIFTY26SEPFUT", lots: 1, ema: 24800 },
  ],
  failures: [{ kind: "broker_timeout", at: "2026-09-08 10:00", until: "2026-09-08 10:20" }],
  sessionSchedule: [{ at: "2026-09-09 11:00", state: "HALTED" }, { at: "2026-09-09 11:30", state: null }],
  restartAt: "2026-09-10 10:00",
  assertions: [
    { type: "no_duplicate_fill_qty" },
    { type: "max_exposure", maxAbsQty: 130 },
  ],
})
```

Named catalogs live in `lib/simulation/catalog.ts`. See [TRADING_SCENARIOS.md](./TRADING_SCENARIOS.md#simulation-catalog).

## Market data

`pricePath` picks a deterministic shape; `volatility` scales noise; `liquidity` sets available qty and default spread; `spreadPoints` overrides the spread; `defects` inject missing/stale/invalid/outage quotes at a timestamp.

Chase actors refuse invalid/stale candles the same way `processUpdateSL` does (bad OHLC or age > 180s).

## Order execution

Orders go to `SimulatedExchange`, never to `kiteconnect`.

- Immediate / delayed / partial / no fill / reject / cancel / expire
- Slippage: `zero` | `fixed` | `percent` | `volatility` | `liquidity` | `seeded`
- Retries use `clientKey` so a lost HTTP response does not double-fill

## Failure injection

`failures: [{ kind, at, until }]` on the timeline:

`broker_unavailable`, `broker_timeout`, `http_500`, `rate_limit`, `connection_reset`, `auth_failure`, `delayed_response`, `unknown_status`, `duplicate_response`, `incorrect_response`, `lost_accept_response`, `delayed_fill`, `database_down`, `redis_down`, `worker_crash`, `app_restart` (also `restartAt`).

Database/Redis flags are recorded as warnings: the hermetic runner does not take down Docker services. Ledger integration tests still cover real Postgres.

## Assertions

Catalog assertions are **outcomes** (qty, risk code, no live entry after close). Every run also checks invariants (no overfill, fills match the book, rejected orders do not open qty).

When a test fails, the error includes **scenario + seed** so you can rerun:

```bash
yarn simulate -- --scenario random --seed 12345
```

## How to read a result

`formatSimReport(result)` prints window, path, signals, orders, fills, per-symbol position, realized/unrealized/fees, risk events, errors, invariant and assertion lines.

`paperRisk: false` evaluates `evaluateOrder` as **live** (market-hours and `LIVE_BLOCKED` apply) while still using the simulated exchange. Default `paperRisk: true` matches `MOCK_ORDERS=true` (paper entries can be placed for execution tests).

## What sim proves / does not prove

**Proves:** NSE calendar and session bounds, injected clock, `evaluateOrder` risk, simulated fills/faults, in-memory book invariants, Chase *buffer* + Chase window, mock-hours skip for timed entries (`paperRisk: true` ≈ `MOCK_ORDERS=true`).

**Does not prove:** Desk punch UI, `/api/trades_day`, BullMQ workers, Postgres ledger, CE+PE strike/skew in `atmStraddle.ts` / `strangle.ts`, or Chase EMA computed from candles. Actors place a single futures MARKET/SL-M on a synthetic symbol. Price paths (gap, crash, trend) move the tape; they are not a PnL backtest of the live option strategies.

If you expected “Sunday Schedule now on the straddle form,” that is unit + API + E2E. `mock-weekend-entry` only shows the **actor** can punch when paper/mock risk is on.

## Isolation

Simulation tests set `SIMULATION=true` and `MOCK_ORDERS=true`. Do not point `KITE_API_ENDPOINT` at `api.kite.trade` in this process.

## Classifying a failure

1. Simulation bug (clock, fill math, catalog config)
2. Test expectation bug
3. Implementation bug (risk gate, book, calendar)
4. Strategy logic (Chase buffer, straddle mock-hours skip)
5. Missing guardrail
6. Legitimate strategy behavior — **document it, do not “fix” the strategy to pass**

Known legitimate behavior: ATM straddle skips `isMarketOpen` when `MOCK_ORDERS=true`. Live-hours scenarios set `paperRisk: false` to exercise the real closed-market reject.
