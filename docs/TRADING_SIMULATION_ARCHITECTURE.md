# Trading simulation architecture

This is a **system and strategy behavior lab**, not a return-optimizing backtester. It answers:

> What happens to the whole desk if the market, calendar, broker, network, or process behaves differently?

It never talks to Zerodha. `SIMULATION=true` and `MOCK_ORDERS=true` are required. The simulated exchange throws if a live Kite host or client is present.

## Pipeline

```
Simulation Clock
       ↓
Market Calendar (NSE session / weekend / holiday / early close)
       ↓
Market State (CLOSED · PRE_MARKET · OPEN · POST_MARKET · HALTED · …)
       ↓
Market Data Generator (OHLC, bid/ask, volume, defects)
       ↓
Application logic (clock-injected time, real risk engine, real accounting)
       ↓
Strategy actors (Chase / straddle / strangle — conditions taken from production code)
       ↓
Signal
       ↓
Risk engine (`evaluateOrder` — the same function the live gate uses)
       ↓
Order
       ↓
Simulated broker / exchange
       ↓
Fill engine (partial, delay, reject, gap-through-stop, slippage)
       ↓
Position book (`applyFillToPosition`)
       ↓
Portfolio / P&L
       ↓
Invariants + outcome assertions + report
```

Workers are **invoked in-process as the clock advances**. The runner does not wait on BullMQ/Redis wall-clock delays. That is intentional: a week of sessions must finish in seconds.

## Components

| Piece | Location | Responsibility |
|---|---|---|
| Clock | `lib/clock.ts` | `now()` / `nowDayjs()`. Production = wall clock. Tests install `SimClock`. |
| Calendar | `lib/marketCalendar.ts` | Weekends, holidays, exclusive 09:15–15:30 IST session, early close, unexpected closure, Chase 09:16–15:29 window. |
| Isolation | `lib/simulation/isolation.ts` | Fail closed if live flags/hosts/Kite clients appear. |
| RNG | `lib/simulation/rng.ts` | Seeded Mulberry32. Same seed ⇒ same path. |
| Price path | `lib/simulation/pricePath.ts` | Named regimes (flat, trend, crash, gap, flash, …) + volatility scale. |
| Market | `lib/simulation/market.ts` | Quotes, spread, liquidity qty, data defects, forced session. |
| Exchange | `lib/simulation/broker.ts` | MARKET / LIMIT / SL / SL-M / SL-L, faults, idempotent `clientKey`. |
| Book | `lib/simulation/book.ts` | In-memory positions via production `applyFillToPosition`. |
| Actors | `lib/simulation/actors.ts` | Thin schedulers using `chaseTolerances`, `chaseAllowsNewEntry`, `evaluateOrder`, `isMarketOpen`. Not `atmStraddle.ts` / `strangle.ts` / Chase queue. |
| Runner | `lib/simulation/runner.ts` | `simulate({ scenario, seed, … })` advances the clock and records a journal. |
| Catalog | `lib/simulation/catalog.ts` | Named scenarios from the initial catalog. |
| Assertions | `lib/simulation/invariants.ts` | Outcome checks, not “function was called”. |

## Time model

- Timezone is **Asia/Kolkata**.
- `SimClock` can set, add (seconds…days), pause/resume, jump to session open/close, next session, next trading day.
- Production call sites that used `new Date()` / `dayjs()` for **decisions** now use `now()` / `nowDayjs()` (`isMarketOpen`, square-off, risk gate, Chase window, EMA “today”).
- There is **no** `if (process.env.TEST)` sprinkled through strategies.
- Session bounds stay **exclusive**: `09:15:00` is not open; `09:15:01` is. That matches historic `isMarketOpen`.

Do not assume 24 hours = one trading day. Weekends and holidays are first-class.

## Market model

- Default venue: NSE F&O continuous session 09:15–15:30 IST.
- States: `CLOSED`, `PRE_MARKET` (from 09:00), `OPEN`, `POST_MARKET` (to 16:00), `OVERNIGHT`, `WEEKEND`, `HOLIDAY`, plus forced `HALTED` / `SUSPENDED`.
- Holidays: historic table (2018–2022) plus 2025–2026 NSE dates. Scenarios can add extras, early closes, or `closedDates`.
- Quotes carry last/bid/ask/OHLC/volume/available qty and an optional **defect** (missing, stale, invalid OHLC, outage, …).

## Execution model

The simulated exchange is the only “broker” the runner talks to.

- Market: fill at ask (buy) / bid (sell) plus slippage, up to available qty.
- Limit / SL-L: fill only when last is marketable.
- SL / SL-M: trigger then market; **gaps through the stop fill at the gapped quote**, not at an impossible mid-price.
- Partial fills leave `PARTIALLY_FILLED` until liquidity returns or the run ends.
- Faults: unavailable, timeout, HTTP 500, 429, reset, auth, lost accept, unknown status, duplicate response, delayed fill.
- Same `clientKey` does not create a second working order (retry ≠ duplicate trade).

## Data model (sim vs production)

Simulation uses the **same money/position math** as the ledger (`lib/trading/accounting.ts`, scale-4 bigint). It does **not** write Postgres or enqueue BullMQ jobs. That keeps CI hermetic and makes it impossible to mutate production rows from a scenario.

A future optional “ledger-backed” mode can persist into a throwaway database. It is not required to validate hours, fills, risk, or restarts.

## Scenario model

A scenario is a `SimulateConfig`:

- window (`start` / `end` IST)
- seed
- instruments
- price path + volatility + liquidity + spread + slippage
- actors (which strategies run)
- calendar overrides
- failure schedule
- data defects
- risk settings
- outcome assertions

`resolveScenario("flash-crash")` fills defaults; callers override any field.

## Assertions

Prefer outcomes:

- no live entry outside the session
- position quantity is exactly N
- filled qty never exceeds order qty
- duplicate broker event did not increase exposure
- stale candle did not trade
- restart restored the same book

Invariants run every simulation, even when the catalog does not name extra assertions.

## Reproducibility

- Seeded RNG for paths and seeded slippage.
- Clock is fully determined by `start`, `end`, `stepMinutes`.
- A failure report prints `scenario`, `seed`, window, invariants, and assertion messages.

## Isolation

`assertSimulationSafe()` throws when:

- `SIMULATION` is not `true`
- `MOCK_ORDERS` is not true
- `KITE_LIVE` / live Kite host is set
- a `KiteConnect`-shaped object is passed into `placeOrder`

## What this is not

- Not a historical NSE tick replay (can be added later as a `custom` path).
- Not a reason to change strategy math so a scenario “looks profitable”.
- Not a substitute for the Postgres ledger integration tests.

If a scenario fails, classify: simulation bug, bad expectation, implementation bug, strategy logic, missing guardrail, or **legitimate** behavior. Do not patch a strategy only to go green.
