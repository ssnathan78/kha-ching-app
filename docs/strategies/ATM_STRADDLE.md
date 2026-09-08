# ATM straddle (intraday)

### Technical specification — as implemented in Kha-Ching

---

## 1. Strategy overview

Sell (default) or buy the **at-the-money call and put** on the same index expiry. Short by default: the structure is **delta-neutral at entry** (short CE + short PE). This is the classic Indian **9:20 straddle** mechanic, even when `runAt` is not exactly 09:20.

This is a **same-session** structure. It is not Chase. Positions are **MIS** by default and must be flat before the close via **independent per-leg stops**, optional point targets, and auto square-off (default 15:20 IST).

**9:20 intent (operator):** on a one-way Nifty day, **only the losing wing’s SL hits**. The other wing is left on as a **trend trade until auto square-off**. That leftover is the design, not a miss, not a naked short, and not a desk failure. Chop that tags **both** stops is the contained worst case (two SL hits). Flattening the leftover wing just because the first SL fired would **break** the strategy.

**Edge hypothesis:** ATM call and put can be mispriced relative to each other for a short window (skew). Wait until that gap is small enough, then sell both. Entry is not a directional view; the leftover wing after one SL *becomes* directional until EOD.

---

## 2. Universe

| Item | Rule |
|---|---|
| Indexes | Nifty, BankNifty, FinNifty (one per weekday plan; punch-now may tick several — each tick is a separate job) |
| Instruments | Current / next / monthly expiry options. Weekly UI is **Nifty only** (`hasWeeklyExpiry`) |
| Product | `MIS` (default) or `NRML` |
| Side | `SHORT` = sell both legs; `LONG` = buy both legs |
| Sizing | `lots × lot_size` per leg. Lot size from the live contract when possible |
| One template | At most one weekday plan row per strategy per weekday |

ATM strike:

```
atmStrike = round(underlyingLTP / strikeStepSize) * strikeStepSize
```

Legs: the CE and PE at that strike for the chosen expiry (`getExpiryTradingSymbol`).

---

## 3. Inputs (operator knobs)

Shipped form defaults live in `STRATEGIES_DETAILS[ATM_STRADDLE].defaultFormState` (`lib/constants.ts`). Env can change lots / ideal skew / SL%:

| Knob | Default | Meaning |
|---|---|---|
| `lots` | `NEXT_PUBLIC_DEFAULT_LOTS` (example: 2) | Lots per leg |
| `maxSkewPercent` | `NEXT_PUBLIC_DEFAULT_SKEW_PERCENT` (example: 10) | Ideal CE–PE gap (%) |
| `thresholdSkewPercent` | 20 | Floor skew if time is running out |
| `expireIfUnsuccessfulInMins` | 10 | How long the skew checker waits |
| `takeTradeIrrespectiveSkew` | false | If the timer expires: enter anyway vs reject |
| `slmPercent` | `NEXT_PUBLIC_DEFAULT_SLM_PERCENT` (example: 30) | Per-leg stop as % of fill premium |
| `exitStrategy` | `INDIVIDUAL_LEG_SLM_1X` | Only this and `NO_SL` are implemented |
| `isAutoSquareOffEnabled` | true | Clock flatten (`NEXT_PUBLIC_DEFAULT_SQUARE_OFF_TIME`, example 15:20 IST) |
| `isMaxLossEnabled` / `maxLossPoints` | true / 20 | Strategy-level flatten in **points**, not rupees |
| `isMaxProfitEnabled` / `maxProfitPoints` | true / 20 | Same; optional trail-up % |
| Hedge | off unless ticked | Far OTM long options (short vol only) |
| Rollback | all three flags true | Flatten if hedge / primary / exit basket breaks |

Desk → Risk still caps lots, open positions, notional, and live vs paper. Strategy code cannot skip that.

---

## 4. Skew gate (entry)

ATM CE and PE premiums are rarely equal. **Skew** is the live gap between those two prices (`getSkew`).

Acceptable if `liveSkew <= updatedSkewPercent`.

For the first half of the checker window, `updatedSkewPercent = maxSkewPercent`. After that it **gravitates** toward `thresholdSkewPercent`:

```
if remaining/total >= 0.5:
  threshold = maxSkewPercent
else:
  threshold = round(remaining/total * maxSkewPercent
                    + (1 - remaining/total) * thresholdSkewPercent)
```

(`lib/strategies/skewMath.ts`)

If the window expires:

- `takeTradeIrrespectiveSkew = true` → enter on current ATM
- else → **reject** (no order)

Live hours: the checker **stops** when the market is closed. Mock orders may continue (`shouldAbortStraddleForClosedMarket`).

Hard cap: 250 skew/network retries, then fail closed.

---

## 5. Order flow

```
skew accepted
    │
    ├─ optional hedge BUYs (short vol + hedge on)
    ├─ CE + PE MARKET (SELL or BUY)
    ├─ margin check on the basket
    ├─ rollback flatten if a leg fails
    └─ enqueue exits (if exitStrategy is queued)
         ├─ per-leg SL (SL-Limit after convert)
         ├─ targetPnL (max loss / max profit in points)
         └─ auto square-off at clock time
```

Hedges are placed **before** the short legs. If hedge fails and `onBrokenHedgeOrders`, already-filled hedges are squared off.

---

## 6. Exits

Stops are **per fill**, not per structure. Hitting the CE stop does **not** cancel or flatten the PE (and the reverse). Planner: `lib/exit-strategies/individualLegPlan.ts`.

| Exit | When | Notes |
|---|---|---|
| Per-leg SL | Premium moves `slmPercent` against **that** fill | Implemented. SL-M converted to SL-Limit (`slLimitPricePercent`). The other leg stays. |
| Combined / Supertrend / OBS trail | Not shown | **Not implemented** — form hides them; schedule validation still rejects them |
| `NO_SL` | Allowed only with auto square-off | Time exit only; this is **not** the 9:20 leftover-wing case |
| Max loss / max profit | Combined structure points | `lib/targetPnL.ts` — do **not** rewrite these as rupees |
| Auto square-off | Clock IST | Default 15:20. Flattens **whatever is still open**, including a leftover wing |
| Kill intraday | Dashboard | Flattens today’s straddles/strangles; does **not** pause Chase |

Points vs rupees: the UI shows both on purpose. Strategy targets stay in option points.

**Do not treat as a bug:** one-way tape → one SL + one open wing until ASO. Sim: `straddle-920-one-way-holds-other-leg`.

**Do treat as a bug:** one SL flattening both legs; flatten qty falling back to configured lots on a flat book; one-legged fill left without rollback.

---

## 7. Scheduling

| Path | Behaviour |
|---|---|
| Weekday plan `/plan` | One template per weekday; Dashboard “Today’s plan” enqueues `tradingQueue` at `runAt` |
| Punch now `/strat/straddle` | Immediate or delayed job; no weekday row required |
| Live closed market | Schedule/punch is rejected (Desk → Alerts). Mock may still place |

Kill scope `intraday` includes this strategy.

---

## 8. Code map

| Piece | File |
|---|---|
| Strike + skew wait | `lib/strategies/atmStraddle.ts` |
| Skew math | `lib/strategies/skewMath.ts` |
| Form defaults | `lib/constants.ts` `STRATEGIES_DETAILS` |
| Validation | `lib/strategyValidation.ts` |
| Per-leg SL | `lib/exit-strategies/individualLegPlan.ts`, `individualLegExitOrders.ts` |
| Point targets | `lib/targetPnL.ts` |
| Time flatten | `lib/exit-strategies/autoSquareOff.ts` |
| Worker | `lib/queue-processor/tradingQueue.ts` |

In-app copy: `/help/straddle`.

---

## 9. FAQ

**Is this the same as Chase?** No. Options, same session, weekday templates.

**What if only one leg fills?** Rollback on primary orders squares what filled. That one-legged book **is** naked risk. It is not the same as a later 9:20 leftover after both legs filled and one SL hit.

**If Nifty trends and one SL hits, should I flatten the other?** No. Hold until auto square-off (or an operator square-off). That is the 9:20 trade.

**Can I run FinNifty?** Yes on straddle. Strangle’s default margin table omits FinNifty; punch-now still depends on validation.

**Does skew use mid or LTP?** Live Kite prices via `getSkew` (LTP path). There is no bid/ask microstructure model.
