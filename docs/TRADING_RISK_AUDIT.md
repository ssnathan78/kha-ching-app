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
| Chase | `lib/chaseSignal.ts`, `chaseQueue.ts` | Nifty futures EMA trend, multi-day |
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

**What it does.** Classic **9:20 short straddle**: sell (default) or buy the ATM call and put after the premium skew is inside a configured band. The book is **delta-neutral at entry**. Optional hedge, **independent** per-leg SL, max loss/profit in **points**, time square-off of whatever is still open.

**Assumptions.** Mean-reverting or range-bound implied vol *until* a wing is stopped; ATM is a usable hedge pair; both legs fill; skew is a stable enough entry filter; lot size and freeze qty are known. After one SL, the leftover wing is allowed to run until ASO.

**When it can work.** Quiet to moderately volatile sessions, and **trend days where one SL hits and the other wing rides** (that leftover is the 9:20 payoff, not a bug). Liquid Nifty/BankNifty/FinNifty weeklies/monthlies.

**When it fails (real failures).** Vol explosions that tag **both** stops (contained: two SL hits). Gap **through** SL on the losing wing. One-legged fill (true naked short — rollback). Skew never converges then `takeTradeIrrespectiveSkew` punches a bad price. Expiry-day gamma. **Do not list “one-way Nifty, one SL, other wing held” as a failure.**

**Maximum plausible loss (uncontrolled, pre-guardrail).** Short options: theoretically large until hedge/square-off. Practically: lots × lot size × adverse premium move, plus margin calls. A 20-lot Nifty short straddle into a **circuit that gaps through SL** is a large rupee loss even with stops. A one-way day with working SL is a **designed** one-leg loss plus a leftover-wing P&L until ASO, not an unbounded two-leg bleed.

**Signal issues.** Skew oscillates around the threshold → historically unbounded 2 ms recursion (now capped). No market-data → remote retry or reject. Late LTP → stale ATM strike. Wrong LTP → wrong strike.

### ATM Strangle

**What it does.** Same 9:20 family, wings chosen by strike distance, % from ATM, or option price. Previously defaulted to **NO_SL**.

**Assumptions.** The wings are far enough that a session move does not tag both; time square-off or SL exists; OTM liquidity is adequate. Same leftover-wing rule as the straddle.

**When it fails.** Fast trend tags one wing hard **and that is the intended SL**; both wings if vol explodes (chop). NO_SL without ASO was a naked hold to expiry/margin. Low-liquidity far OTM → slip / partial.

**Default change.** New forms default to `INDIVIDUAL_LEG_SLM_1X` and rollback-on-broken-leg **true**. Existing saved plans are not rewritten.

### Chase

**What it does.** Nifty futures around a long EMA with a buffer. States: awaiting signal → awaiting long/short (SL-M entry) → long/short with SL → rollover near expiry.

**Assumptions.** Daily/2-min closes are timely; EMA regime persists; SL-M fills **when the trigger is tagged** (paper resting stops now match that; they must not fill at submit); overnight gaps are acceptable for NRML futures; one Chase position.

**When it fails.** Chop around EMA (whipsaw). Gap through SL overnight. SL breach previously **updated DB only and did not flatten** (now MARKET flatten). `placeKiteOrder` used to skip the ensurer — still does, but now goes through `placeOrder` + risk gate + mock short-circuit. EMA “today” filter has used UTC (residual).

**Maximum plausible loss.** 1 futures position × lots × lot size × gap. Multiple lots (capped at order time). Overnight gap is the structural risk; this strategy is designed to hold across sessions.

## 3. Market-condition analysis

| Regime | Straddle / strangle (short, 9:20) | Chase |
|--------|-----------------------------|--------|
| Strong trend | **Intended:** losing wing SL; leftover wing held until ASO | Works if aligned; late entry chases |
| Sideways | Both premiums decay; neither SL required | Whipsaw around EMA |
| Chop / noisy skew | Both SLs can hit (contained worst case); over-wait or punch on skew timer | Rapid SL/entry flips if candles oscillate |
| Vol spike | Short gamma; both stops or a gap through SL | SL gap; wide futures spread |
| Flash crash/rally | SL gapped; hedge may not exist | SL candle logic can miss intra-bar spike |
| Gap up/down | Open through SL on a wing | Overnight futures gap |
| Low liquidity / wide spread | Partial, reject, worse ATM | Futures usually OK; rolls less so |
| Halt / holiday | `isMarketOpen` + risk `MARKET_CLOSED`; flatten/SL still allowed when halted | Chase window 09:16–15:29 IST |
| News | Same as vol spike | Same |

Adversarial “make it lose fast without a software bug”: a **gap through SL** on a fat-finger lot size, **NO_SL with ASO off** (now rejected at validation), a **one-legged fill** left without rollback, or Chase long into a gap-down open. A clean one-way BankNifty/Nifty day with working per-leg stops is **not** that list.

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
| R17 | High | Paper ensurer skipped `placeOrder` then polled Kite for `paper:` ids | **Fixed** — paper writes the ledger. Untriggered SL rests until tagged. SHORT/LONG with a flat book resets; it does not MARKET configured lots (paper and live). |
| R18 | High | Exits without `strategy` defaulted PAPER (live flatten/SL would not hit Kite) | **Fixed** — Chase tag / job strategy inferred; `placeSL`/`placeKiteOrder` set `CHASE` |
| R19 | Med | Recon compared paper ledger qty to Kite | **Fixed** — PAPER/MOCK excluded from broker compare |
| R20 | Med | Portfolio chips / daily_sessions mix paper + live | Residual — Desk tabs filter; header totals do not |
| R21 | High | Paper leftover blocked Live or sized a Kite flatten | **Fixed** — Paper → Live archives paper (no Kite), resets Chase to `AWAITING_SIGNAL`, live book ignores paper qty |

## 5. Portfolio risks

Strategies can overlap: short Nifty options **and** long/short Nifty futures. That is correlated Nifty risk, not two independent books.

There is **no** per-sector model. Caps are:

- max lots / qty / notional per order
- max open positions and working orders
- max orders / minute
- strategy disable list
- desk halt

There is no automatic reduction of size in high-vol regimes. That is intentional: we did not add untested “smart” filters.

## 6. P&L and sizing

- UI rupee P&L (`lib/pnl.ts`) and strategy **points** (`lib/targetPnL.ts`) must stay separate.
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

**Most realistic large loss today:** short options **gapping through** the losing-wing SL (and/or both SLs in a vol explosion) on a large lot size, with ASO not yet due; a **one-legged fill** if rollback fails; or Chase NRML held overnight through a gap. A one-way session that stops one 9:20 wing and holds the other until 15:20 is **the strategy**, not the large-loss case.

**What happens:** SL/exit/flatten still allowed when the desk is halted. New entries are rejected. There is no daily-loss or drawdown gate on Chase / straddle / strangle.

**What prevents catastrophe:** lot/qty/notional caps, NO_SL+ASO rule, mock/live/paper triple gate, kill + halt, flatten-on-Chase-SL.

**Can that protection fail?** Yes if Kite is down, if flatten is rejected, or if the operator raised the caps. Two-failure example: halt flag not persisted **and** workers still punching — mitigated by `placeOrder` reading `risk_settings` on every order; if that table is unreadable, settings fail closed (halted).

## 9. Recommended remaining work (not done)

- Paper MARKET fills still use order price / trigger / LTP-if-fetched / 0 when Kite LTP is missing. Entries now fetch LTP in `placeOrder` / `remoteOrderSuccessEnsurer` so `MAX_NOTIONAL` applies; flatten/SL/EXIT do not use LTP/notional/lots so an exit cannot be skipped.
- Route Chase entries through `remoteOrderSuccessEnsurer` (freeze split + ABORT). Chase size should stay under freeze qty.
- Desk portfolio chips and daily sessions still mix paper + live P&L. Trade/position/order tabs filter by book.
- Recon-driven strategy halt on persistent **live** quantity mismatch (paper rows are excluded from Kite compare).
- Operator runbook for “Kite down, position open”.
- New strategy keys must be added to `RISK_STRATEGY_KEYS` to appear on Desk → Risk; until then they still default PAPER.
