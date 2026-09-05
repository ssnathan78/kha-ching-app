# Trading risk audit

Adversarial review of Kha-Ching as a **personal live-trading desk**, not a generic security review. The question is: how can this system lose money in real NSE / Kite conditions, and what now stops that from becoming uncontrolled.

This audit does **not** claim the strategies have edge. A correct implementation of a losing strategy is still a losing strategy. Guardrails exist so a wrong strategy, a software bug, stale data, or a broker failure cannot compound into a blow-up.

Related: [TRADING_GUARDRAILS.md](./TRADING_GUARDRAILS.md), [TRADING_SCENARIOS.md](./TRADING_SCENARIOS.md), [TRADING_RISK_TESTS.md](./TRADING_RISK_TESTS.md), [TRADING_LIFECYCLE.md](./TRADING_LIFECYCLE.md).

## 1. System map

```
Kite LTP / candles / instruments
        ↓
Validation (hours, OHLC, freshness, skew timeout)
        ↓
Indicators (ATM strike, skew %, 40-EMA, Chase T1)
        ↓
Strategy (straddle / strangle / Chase)
        ↓
Signal / decision (ledger trading_decisions — audit only)
        ↓
Risk engine (lib/trading/riskEngine.ts)  ← independent of strategy
        ↓
placeOrder (lib/kiteUtils.ts) — MOCK short-circuit or Kite
        ↓
Order status / ensurer / orderbook sync
        ↓
Fills → positions → P&L (ledger + Kite)
        ↓
Exits: SL queue, targetPnL (points), time square-off, Chase SL, kill desk
```

| Component | Where | Role |
|-----------|--------|------|
| ATM Straddle | `lib/strategies/atmStraddle.ts` | Same-session ATM CE+PE, skew wait |
| ATM Strangle | `lib/strategies/strangle.ts` | Same-session OTM wings |
| Subscribe & Chase | `lib/chaseSignal.ts`, `chaseQueue.ts` | Nifty futures EMA trend, multi-day |
| Exits | `lib/exit-strategies/`, `targetPnL.ts` | Per-leg SL, time ASO, point targets |
| Watchers | `lib/watchers/` | SL-L / SL-M repair |
| Sizing | lots × NSE lot size (`lib/pnl.ts` `orderQuantity`) | No volatility sizing |
| Broker | Zerodha Kite Connect | Sole market-data and execution venue |
| Ledger | `lib/trading/` | Decisions, orders, fills, positions, recon |
| Risk | `lib/trading/riskEngine.ts` + `riskGate.ts` | Pre-trade hard limits |
| Kill | `lib/killDesk.ts`, `/api/kill-desk`, Desk halt | Abort jobs + persist desk halt |
| Queues | BullMQ in `lib/queue.ts` | Entry, exit, ASO, target, ancillary, Chase |

There is **no backtester** in this repo. There is no implied live edge from historical returns.

## 2. Strategy inventory

### ATM Straddle

**What it does.** Sell (default) or buy the ATM call and put after the premium skew is inside a configured band. Optional hedge, per-leg SL, max loss/profit in **points**, time square-off.

**Assumptions.** Mean-reverting or range-bound implied vol over the session; ATM is a usable hedge pair; both legs fill; skew is a stable enough entry filter; lot size and freeze qty are known.

**When it can work.** Quiet to moderately volatile sessions, liquid Nifty/BankNifty/FinNifty weeklies/monthlies.

**When it fails.** Trend days and vol explosions (short vol bleeds on both sides). Gap through SL. One-legged fill (naked short). Skew never converges then `takeTradeIrrespectiveSkew` punches a bad price. Expiry-day gamma.

**Maximum plausible loss (uncontrolled, pre-guardrail).** Short options: theoretically large until hedge/square-off. Practically: lots × lot size × adverse premium move, plus margin calls. A 20-lot Nifty short straddle into a circuit is a large rupee loss even with SL, because SL-M/SL-L can gap.

**Signal issues.** Skew oscillates around the threshold → historically unbounded 2 ms recursion (now capped). No market-data → remote retry or reject. Late LTP → stale ATM strike. Wrong LTP → wrong strike.

### ATM Strangle

**What it does.** Same family, wings chosen by strike distance, % from ATM, or option price. Previously defaulted to **NO_SL**.

**Assumptions.** The wings are far enough that a session move does not tag both; time square-off or SL exists; OTM liquidity is adequate.

**When it fails.** Fast trend tags one wing hard; both wings if vol explodes. NO_SL without ASO was a naked hold to expiry/margin. Low-liquidity far OTM → slip / partial.

**Default change.** New forms default to `INDIVIDUAL_LEG_SLM_1X` and rollback-on-broken-leg **true**. Existing saved plans are not rewritten.

### Subscribe & Chase

**What it does.** Nifty futures around a long EMA with a buffer. States: awaiting signal → awaiting long/short (SL-M entry) → long/short with SL → rollover near expiry.

**Assumptions.** Daily/2-min closes are timely; EMA regime persists; SL-M fills; overnight gaps are acceptable for NRML futures; one Chase position.

**When it fails.** Chop around EMA (whipsaw). Gap through SL overnight. SL breach previously **updated DB only and did not flatten** (now MARKET flatten). `placeKiteOrder` used to skip the ensurer — still does, but now goes through `placeOrder` + risk gate + mock short-circuit. EMA “today” filter has used UTC (residual).

**Maximum plausible loss.** 1 futures position × lots × lot size × gap. Multiple lots (capped at order time). Overnight gap is the structural risk; this strategy is designed to hold across sessions.

## 3. Market-condition analysis

| Regime | Straddle / strangle (short) | Chase |
|--------|-----------------------------|--------|
| Strong trend | Both legs lose; SL/ASO must fire | Works if aligned; late entry chases |
| Sideways | Intended habitat | Whipsaw around EMA |
| Chop / noisy skew | Over-wait or punch on expiry of skew timer | Rapid SL/entry flips if candles oscillate |
| Vol spike | Short gamma disaster | SL gap; wide futures spread |
| Flash crash/rally | SL gapped; hedge may not exist | SL candle logic can miss intra-bar spike |
| Gap up/down | Open through SL | Overnight futures gap |
| Low liquidity / wide spread | Partial, reject, worse ATM | Futures usually OK; rolls less so |
| Halt / holiday | `isMarketOpen` + risk `MARKET_CLOSED` | Chase window 09:16–15:29 IST |
| News | Same as vol spike | Same |

Adversarial “make it lose fast without a software bug”: short a 20-lot straddle into a one-way BankNifty day with NO_SL and ASO off (now rejected at validation), or leave Chase long into a gap-down open.

## 4. Technical / execution risks

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| R1 | Critical | No independent pre-trade risk layer | **Fixed** — `evaluateOrder` in `placeOrder` |
| R2 | Critical | `placeOrder` always called Kite; `MOCK_ORDERS` only in ensurer | **Fixed** — mock short-circuit in `placeOrder` |
| R3 | Critical | Chase SL breach did not flatten | **Fixed** — MARKET flatten then status update |
| R4 | High | Live vs paper only one env flag | **Updated** — process `MOCK_ORDERS` + desk `allowLiveOrders` + per-strategy `executionMode` (default PAPER) |
| R5 | High | Unbounded straddle skew recursion | **Fixed** — 250 attempt cap + market hours |
| R6 | High | Strangle default NO_SL | **Fixed** for new defaults; NO_SL now requires ASO |
| R7 | High | Rollback defaults false (naked leftover) | **Fixed** for new defaults |
| R8 | High | Kill desk did not persist a halt for workers | **Fixed** — `risk_settings.desk_halted` |
| R9 | Med | Duplicate entries via retries / two workers | **Mitigated** — working-order duplicate check + rate cap |
| R10 | Med | Stale Chase candles traded as live | **Fixed** — invalid/stale candle fail-closed |
| R11 | Med | `targetPnL` is points, not rupee kill | **Documented residual** — do not use as rupee halt |
| R12 | Med | Max-profit path historically did not always flatten | Residual — operator must not treat max-profit as a hard flatten |
| R13 | Med | Ledger ≠ Kite after crash | Recon exists; mismatch does not auto-trade |
| R14 | Med | Chase `placeKiteOrder` skips freeze-qty split / ensurer | Residual — Chase size should stay under freeze |
| R15 | Low | Fees/STT not in risk notional | Residual — notional uses premium/LTP only |
| R16 | Low | No order-book depth / liquidity check | Residual — personal size assumed small vs Nifty fut/opt |
| R17 | High | Paper ensurer skipped `placeOrder` then polled Kite for `paper:` ids | **Fixed** — paper returns a synthetic COMPLETE from `placeOrder` |
| R18 | High | Exits without `strategy` defaulted PAPER (live flatten/SL would not hit Kite) | **Fixed** — Chase tag / job strategy inferred; `placeSL`/`placeKiteOrder` set `SUBSCRIBE_CHASE` |
| R19 | Med | Recon compared paper ledger qty to Kite | **Fixed** — PAPER/MOCK excluded from broker compare |
| R20 | Med | Portfolio chips / daily_sessions mix paper + live | Residual — Desk tabs filter; header totals do not |

## 5. Portfolio risks

Strategies can overlap: short Nifty options **and** long/short Nifty futures. That is correlated Nifty risk, not two independent books.

There is **no** per-sector model. Caps are:

- max lots / qty / notional per order
- max open positions and working orders
- max orders / minute
- daily loss (ledger net P&L) and drawdown %
- strategy disable list
- desk halt

There is no automatic reduction of size in high-vol regimes. That is intentional: we did not add untested “smart” filters.

## 6. P&L and sizing

- UI rupee P&L (`lib/pnl.ts`) and strategy **points** (`lib/targetPnL.ts`) must stay separate.
- Daily-loss halt uses **ledger** realized + unrealized, not Kite points.
- Position size = `lots * lot_size`. Lot size comes from the instrument master at punch time. Wrong lot size → wrong qty (risk qty/notional caps still apply).
- No leverage slider; MIS vs NRML changes margin and overnight eligibility, not a computed leverage number.

## 7. Residual risks (cannot be coded away)

1. A gap through every stop on short options or Chase futures.
2. Kite accepting an order that this process never saw (manual app / another session) until recon.
3. Operator sets `MOCK_ORDERS=false`, enables Desk “Allow live orders”, **and** flips a strategy to Live on a funded account.
4. Redis/DB outage after an order is live — flatten may fail; kill still tries.
5. Point-based max-loss firing late or not at all if LTPs are stale (risk engine does not read `targetPnL`).
6. Two things failing together: e.g. stale Kite positions API **and** a strategy that thinks it is flat.

## 8. Final adversarial pass

**Most realistic large loss today:** short multi-lot straddle/strangle into a one-way move, SL gapped, ASO not yet due; or Chase NRML held overnight through a gap.

**What happens:** SL/exit/flatten still allowed when the desk is halted. New entries are rejected. Daily loss / drawdown halt the desk after the damage is already on the book.

**What prevents catastrophe:** lot/qty/notional caps, NO_SL+ASO rule, mock/live/paper triple gate, kill + halt, flatten-on-Chase-SL.

**Can that protection fail?** Yes if Kite is down, if flatten is rejected, or if the operator raised the caps. Two-failure example: halt flag not persisted **and** workers still punching — mitigated by `placeOrder` reading `risk_settings` on every order; if that table is unreadable, settings fail closed (halted).

## 9. Recommended remaining work (not done)

- Paper MARKET fills still use order price / trigger / LTP-if-passed / 0. Callers should pass `ltp` on `placeOrder`.
- Route Chase entries through `remoteOrderSuccessEnsurer` (freeze split + ABORT). Chase paper now falls back to the ledger when Kite has no position.
- Desk portfolio chips and daily sessions still mix paper + live P&L. Trade/position/order tabs filter by book.
- Freshness on straddle/strangle LTP at punch (risk already supports `ltp`/`ltpAt` when callers pass it).
- Recon-driven strategy halt on persistent **live** quantity mismatch (paper rows are excluded from Kite compare).
- Operator runbook for “Kite down, position open”.
- New strategy keys must be added to `RISK_STRATEGY_KEYS` to appear on Desk → Risk; until then they still default PAPER.
