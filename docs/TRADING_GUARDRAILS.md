# Trading guardrails

Every implemented control: what it protects, where it is enforced, trigger behavior, configurability, and tests.

Resume after a halt is **always manual**. Nothing in workers auto-clears `desk_halted`.

## Independent risk engine

| | |
|--|--|
| Protects | Strategy bugs, oversized punches, live/paper mix-up, halted desk, overtrading |
| Enforced | `lib/trading/riskEngine.ts` `evaluateOrder` via `lib/trading/riskGate.ts` `assertOrderAllowed` **before** Kite in `placeOrder` |
| Trigger | Throws `RiskRejectedError`; audit event; daily-loss/drawdown also call `haltDesk` |
| Config | Desk → Risk (`risk_settings` + per-strategy limits). Env is infra only (`MOCK_ORDERS` = this process does not call Kite). |
| Tests | `__tests__/unit/trading/riskEngine.test.ts`, `__tests__/api/desk.test.ts` |

Flatten / SL / EXIT roles **skip** halt, trading-disabled, daily-loss, drawdown, duplicate, rate, and open-position caps so a kill can still reduce risk.

## Live vs paper

| | |
|--|--|
| Protects | Accidental real-money orders; new strategies in production with live quotes |
| Enforced | Triple gate: process `MOCK_ORDERS=false` **and** Desk `allowLiveOrders` **and** per-strategy `executionMode=LIVE`. Unknown strategies default PAPER. Paper still uses live LTP and writes the ledger (`provenance` PAPER or MOCK). |
| Trigger | `LIVE_BLOCKED` |
| Config | `.env` + Desk → Risk execution select (default PAPER) + `allowLiveOrders=false` |
| Tests | `riskEngine.test.ts` live-gate and `isPaperStrategy` cases |

## Desk halt / kill switch

| | |
|--|--|
| Protects | Runaway entries, operator emergency |
| Enforced | `runDeskKill` aborts jobs, optional Chase pause + square-off, then `haltDesk`. Desk UI Halt / Resume. Workers read `desk_halted` on every `placeOrder` |
| Trigger | New **entries** rejected (`DESK_HALTED`). Flatten still allowed |
| Config | Halt reason string; resume is explicit POST `action:resume` |
| Tests | `desk.test.ts` halt/resume; existing `kill-desk.test.ts` |

## Quantity / lots / notional

| | |
|--|--|
| Protects | Fat-finger size, wrong lot size exploding qty |
| Enforced | `maxQtyPerOrder` (1800), `maxLots` (20), `maxNotionalInr` (20 lakh) |
| Trigger | `MAX_QTY` / `MAX_LOTS` / `MAX_NOTIONAL` |
| Config | `risk_settings` |
| Tests | `riskEngine.test.ts` |

Plan/job validation still caps lots at 100 (`validateLots`). The **order** cannot exceed risk max lots.

## Open position / working order / rate

| | |
|--|--|
| Protects | Stacked jobs, retry storms, two browsers punching |
| Enforced | `maxOpenPositions` 12, `maxOpenOrders` 40, `maxOrdersPerMinute` 20, duplicate working order (tag+symbol+side+qty) |
| Trigger | `MAX_POSITIONS` / `MAX_OPEN_ORDERS` / `ORDER_RATE` / `DUPLICATE` |
| Config | `risk_settings` |
| Tests | `riskEngine.test.ts` |

## Daily loss and drawdown

| | |
|--|--|
| Protects | Continued punching after a bad morning |
| Enforced | Ledger `netPnl` ≤ −`maxDailyLossInr` (50k); `drawdownPct` ≥ `maxDrawdownPct` (15%) |
| Trigger | Reject entry, persist halt. Does **not** flatten by itself — use Kill desk |
| Config | `risk_settings` |
| Tests | `riskEngine.test.ts` |

Uses ledger P&L, not `targetPnL` points.

## Market hours and stale / invalid data

| | |
|--|--|
| Protects | After-hours punches; trading on frozen quotes |
| Enforced | `requireMarketHours` + `isMarketOpen` for live entries; optional `ltp`/`ltpAt` age (`stalePriceMaxAgeSec` 30s); Chase candles invalid/stale (>180s) fail closed |
| Trigger | `MARKET_CLOSED` / `STALE_DATA` / `INVALID_PRICE` / Chase skip |
| Config | `risk_settings`; Chase 180s is code |
| Tests | `riskEngine.test.ts`; Chase path is scenario-documented |

## Job abort and strategy disable

| | |
|--|--|
| Protects | Deleted/aborted job still punching; one bad strategy |
| Enforced | `job_executions.user_override=ABORT`; `disabledStrategies` JSON |
| Trigger | `JOB_ABORTED` / `STRATEGY_DISABLED` |
| Config | Dashboard abort; PUT risk settings |
| Tests | Existing abort API tests; `riskEngine.test.ts` strategy disable |

## Configuration validation

| | |
|--|--|
| Protects | NO_SL with no time exit; nonsense lots/SL%; unimplemented exits |
| Enforced | `lib/strategyValidation.ts` on plan + `trades_day` |
| Trigger | HTTP 400 |
| Config | Not bypassable by strategy code |
| Tests | `__tests__/unit/strategyValidation.test.ts` |

`NO_SL` requires `isAutoSquareOffEnabled === true`.

## Safer form defaults

| | |
|--|--|
| Protects | Operator accepting factory defaults that leave naked risk |
| Enforced | `lib/constants.ts` — strangle exit `INDIVIDUAL_LEG_SLM_1X`; rollback flags true |
| Trigger | New forms only; saved plans unchanged |
| Tests | Defaults used by `planMapper` / form tests still valid |

## Straddle skew loop

| | |
|--|--|
| Protects | Stack overflow / tight loop calling Kite until the process dies |
| Enforced | Max 250 attempts; live path requires `isMarketOpen` |
| Trigger | Reject trade |
| Config | Code constant |
| Tests | Existing timeout tests; market/attempt guards are unit-covered via reject paths when mocked |

## Chase SL flatten

| | |
|--|--|
| Protects | Status AWAITING_SIGNAL while futures still open |
| Enforced | `processUpdateSL` MARKET flatten (`purpose: FLATTEN`) then status update |
| Trigger | Candle high/low through SL |
| Config | Automation only if Chase lots > 0 |
| Tests | Documented in scenarios; flatten role tests in risk engine |

## Fail-closed settings

| | |
|--|--|
| Protects | Risk DB/table unavailable |
| Enforced | `getRiskSettings` returns halted + trading disabled on error |
| Trigger | Entries rejected |
| Tests | Implicit via fail-closed defaults |

## Paper ledger vs broker

| | |
|--|--|
| Protects | Believing internal state after a crash |
| Enforced | `/api/desk/reconcile` — records mismatches, does not place orders |
| Trigger | Recon events on Desk → Activity |
| Tests | Ledger integration + desk API |

## What is intentionally not a guardrail

- Changing `targetPnL` from points to rupees (project rule).
- Volatility-based sizing or “regime filters” without a testable rationale.
- Automatic resume after daily loss.
- Invented brokerage/STT in the risk notional.
