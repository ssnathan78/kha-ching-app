# Trading scenarios

Two catalogs live here:

1. **Simulation catalog** — named runs of the reusable market simulator (`yarn simulate`, `yarn sim-test`). How to write one: [TRADING_SIMULATION_GUIDE.md](./TRADING_SIMULATION_GUIDE.md). Architecture: [TRADING_SIMULATION_ARCHITECTURE.md](./TRADING_SIMULATION_ARCHITECTURE.md).
2. **Risk expected behavior** (below) — what the live desk should do in each regime. A simulation going green does not change these semantics.

## Simulation catalog

Implemented in `lib/simulation/catalog.ts`. IDs are CLI names (`yarn simulate -- --scenario flash-crash`).

### Market / session

| ID | What it exercises |
|---|---|
| `normal-day` | 09:00–16:00, scheduled straddle entry |
| `pre-market` | Live-risk path before 09:15 — no live entries |
| `market-open` | 09:00–09:45, 1-minute steps, open volatility |
| `midday` | Mid-session sideways tape |
| `market-close` | 15:15–16:10 — no live entry after 15:30 |
| `post-market` | Chase after 15:30 does not order |
| `overnight` | Close → next open with a gap-down path |
| `weekend` | Friday → Monday, live entries only in session |
| `live-weekend-block` | Same as `weekend` (live risk, no entries after close) |
| `mock-weekend-entry` | Saturday mock/paper timed straddle **does** create an order |
| `holiday` | 2026-01-26 Republic Day |
| `unexpected-closure` | Weekday forced closed |
| `market-halt` | OPEN → HALTED → resume |
| `market-resume` | Halt cleared, session continues |

### Price behavior

`flat`, `uptrend`, `downtrend`, `sideways`, `choppy`, `breakout`, `reversal`, `high-volatility`, `low-volatility`, `volatility-spike`, `crash`, `rally`, `gap-up`, `gap-down`, `flash-crash`, `flash-rally`

### Execution

`immediate-fill`, `delayed-fill`, `partial-fill`, `no-fill`, `rejection`, `cancellation`, `expiration`, `slippage`, `wide-spread`, `low-liquidity`

### Infrastructure

`broker-timeout`, `broker-unavailable`, `network-failure`, `duplicate-event`, `delayed-event`, `database-failure`, `redis-failure`, `worker-crash`, `application-restart`, `reconciliation-mismatch`

### Strategy

`normal-signal`, `repeated-signal`, `signal-oscillation`, `conflicting-signals`, `entry-exit-collision`, `strategy-disabled`, `strategy-paused`, `risk-limit-reached`, `drawdown-reached` (catalog id kept; asserts `MAX_POSITIONS`), `chase-gap-down` (Chase actor across an overnight gap; book qty stays consistent, not a PnL check), `chase-risk-reject-no-phantom`, `chase-phantom-flatten-no-lots`, `chase-max-lots-reject-no-phantom`, `chase-max-positions-no-entry`, `chase-live-blocked`, `chase-halted-no-entry`, `chase-paper-to-live-open`, `chase-live-to-paper-open`

Chase actors use production `chaseTolerances` / `chaseAllowsNewEntry`. They do not invent a different indicator.

### 9:20 option legs (delta-neutral entry)

Two-leg CE+PE actors with independent premium paths. A one-way tape must **not** flatten the leftover wing.

| ID | What it exercises |
|---|---|
| `straddle-920-one-way-holds-other-leg` | CE rallies through SL; PE downtrend has **no** SL; PE EXIT at 15:20; both books flat |
| `strangle-920-one-way-holds-other-leg` | Same 9:20 leftover-wing rule for ATM_STRANGLE |
| `straddle-920-chop-stops-both-legs` | Both premiums rally through SL; no invented ASO size |
| `strangle-920-chop-stops-both-legs` | Same chop for ATM_STRANGLE |

### Portfolio

`multiple-positions`, `multiple-strategies`, `correlated-positions`, `cash-constraint`, `exposure-limit`, `maximum-position`, `portfolio-drawdown`, `simultaneous-signals`

### Stochastic

`random` — seeded mix; always print the seed on failure.

---

# Risk expected behavior

Expected system behavior after guardrails. “Entry” means a new risk-increasing order. Flatten/SL/exit must still be possible unless Kite itself is down.

## Normal trading

Process paper (`MOCK_ORDERS=true`): `placeOrder` records ledger, returns `paper:…`, does not call Kite. Per-strategy paper (prod with live quotes): same ledger path when Desk execution is Paper, even if `MOCK_ORDERS=false`. Live only if env + desk allow-live + that strategy is Live. Skew/EMA logic unchanged.

## Highly volatile market

Short straddle/strangle (9:20): each wing has its own SL. A one-way day should stop **one** wing and hold the other until ASO. Chop can stop both. Risk engine does not shrink lots automatically. Notional cap can reject a fat-finger premium × qty.

Chase: SL candle or `placeSL` market fallback if already through the stop.

## Sideways / choppy

Chase can flip. Rate cap (20/min) and duplicate working-order check limit churn from retries, not from genuine new signals. No minimum hold time is implemented (residual).

## Sudden crash / rally

Stops can gap. Flatten role remains allowed after desk halt. There is no daily-loss or drawdown gate.

## Gap through stop

Chase: if the next candle already violates SL, flatten MARKET then set AWAITING_SIGNAL. If Kite rejects the flatten, status may still update — residual: operator must recon + flatten manually.

Options: SL-L/SL-M gap is exchange behavior; watchers try to repair.

## Liquidity collapse

No depth check. Orders can rest or partial-fill. Ledger supports partial fills. Do not assume displayed LTP is a fill.

## Stale market data

- Risk: `ltpAt` older than `stalePriceMaxAgeSec` → `STALE_DATA` (when callers pass LTP).
- Chase: candle older than 180s or invalid OHLC → no signal, no flatten-from-that-candle.
- Missing Chase candles → skip.

## Broker outage

`placeOrder` throws after risk passed; ledger marks FAILED. Ensurer/retry must not blindly duplicate (duplicate working order + tag). Unknown state → recon before another entry.

## Network failure after submit

Order may be live at Kite with FAILED/UNKNOWN locally. Next entry with same tag/symbol/qty can be `DUPLICATE` if still working. Reconcile.

## Duplicate signal / duplicate execution

Same tag + symbol + side + qty while an order is PENDING/SUBMITTED/ACCEPTED/PARTIAL/UNKNOWN → `DUPLICATE`. Two different tags (two jobs) are separate — max positions/orders apply.

## Partial fill

Ledger average-cost path. Exit qty uses `Math.min(order.qty, abs(net))` in square-off. Residual: Chase flatten uses `abs(netQty)`.

## Application / Redis / DB restart

Workers restart with the process. Jobs in BullMQ retry. `placeOrder` is not retried by the risk engine. DB down: settings fail closed (no new entries). Redis down: no new scheduled jobs; open Kite positions remain.

## Strategy drawdown / portfolio drawdown

Chase / straddle / strangle are **not** gated on daily P&L or drawdown. `portfolio-drawdown` is a crash price-path scenario only. `drawdown-reached` asserts the open-position cap (`MAX_POSITIONS`). Kill desk is the flatten path.

## Kill switch

`POST /api/kill-desk` `{ scope: "intraday" | "all" }`: abort jobs, optional Chase pause + square-off, persist halt. Desk **Halt new entries** only persists halt (does not flatten). Resume requires confirmation on `/desk`.

## Conflicting strategies

Straddle short Nifty options and Chase long Nifty futures can offset or stack. No net-delta engine. Caps are count/notional, not “net Nifty delta”. Treat as residual portfolio risk.

## Invalid configuration

`NO_SL` without auto square-off → 400 at plan/job API. Unimplemented exit strategies → 400. Lots &lt; 1 or &gt; 100 → 400. Live without both live flags → `LIVE_BLOCKED` at order time.

## Market closed

Live entries: `MARKET_CLOSED`. Mock entries allowed (paper). Chase `processUpdateSL` skips outside 09:16–15:29 IST.

## Extreme prices

`minLtp` 0.05; non-finite / zero LTP rejected when supplied. Qty must be a positive integer.

## Settings table missing

`getRiskSettings` returns halted defaults. New entries fail closed until `yarn migrate` applies `drizzle/0006_risk_settings.sql`.
