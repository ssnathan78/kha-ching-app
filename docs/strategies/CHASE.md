# Chase (continuous)

### Technical specification — as implemented in Kha-Ching

This document is what **this app** does. Differences vs the operator Chase rule book (Feb 2024) and vs the Python [chase-bot](https://github.com/ssnathan78/chase-bot) are in [IMPLEMENTATION_REVIEW.md](./IMPLEMENTATION_REVIEW.md).

---

## 1. Strategy overview

Chase is a **long/short trend-follow** on **index futures**, not options. It uses a **40-period EMA of hourly HLC3**, ±0.2% signal bands, ±0.4% T1 bands (for the **morning-after** stop, not for entry), and **day high/low** for the pending entry and initial stop.

It is **continuous**: one lots + engine config (not a weekday template). Positions are **NRML** and can stay open across sessions. Hourly monitoring is done by this desk rather than by hand.

**Edge hypothesis:** Hourly closes outside a thin EMA band mark the start of a trend. Enter on a break of the day’s extreme; risk the other extreme (or the EMA if that is further). Trail using T1 logic the next morning and EMA thereafter.

---

## 2. Universe

| Item | Rule |
|---|---|
| Indexes | Operator-selected: Nifty (default), BankNifty, FinNifty. Each has its own `chase_status` |
| Contract | Near **futures** (`getFnOExpiries`). On expiry day the worker also loads the next month for rollover |
| Product | `NRML` |
| Sizing | `lots × futures lot_size` |
| Pyramiding | None. One position (or pending entry) per index |
| Pause | After LONG/SHORT is flat, do not enter. Pending SL-M entries are cancelled |

Kill **intraday** does **not** pause Chase. Kill **all** does, and tries to flatten Chase futures.

---

## 3. Inputs & formulas

Shipped engine (`CHASE_MASTER_DEFAULTS` / `/chase`):

| Input | Default | Formula |
|---|---|---|
| EMA period | 40 | `EMA(hlc3, period)` on **60-minute** candles |
| HLC3 | — | `(high + low + close) / 3` |
| Buffer (signal) | 0.2 | Stored as **percent**. `longTol = ema * (1 + buffer/100)` → 1.002× |
| T1 | 0.4% hard-coded | `longT1 = round(ema * 1.004)`, `shortT1 = round(ema * 0.996)` |
| Entry limit offset | 5 ₹ | SL **limit** = trigger ± 5 on the pending entry order |
| Lots | 1 | Per selected index |

Helper: `chaseTolerances(ema, bufferPercent)` in `lib/chaseDefaults.ts`.

**Rounding:** day’s high is **ceiled**, day’s low is **floored**, to whole rupees. EMA and last close stay `Math.round`.

**Incremental EMA:** After the first seed, each hourly job applies `new = hlc3 * k + prev * (1-k)` with `k = 2/(period+1)`, using the **previous hour’s stored EMA** when `getAcceptedPrevEma` accepts it (10:15 IST requires yesterday’s **16:15** row; later hours require the prior hour on the minute). If that exact row is missing, the job still updates from the **last stored EMA** and still evaluates the signal, and raises `CHASE_EMA_GAP` (one missed hourly HLC3; no 60-day rebuild). A contract with **no** `ema` rows still seeds from history.

---

## 4. State machine

`chase_status.status` (`lib/constants.ts` `CHASE_STATUS`):

```
AWAITING_SIGNAL
    │ hourly close > longTol
    ▼
AWAITING_LONG  ──entry SL-M @ day's high──►  LONG
    │ close < SL, or 2h on far side of shortTol
    ▼
AWAITING_SIGNAL  (and re-evaluate same hour)

AWAITING_SIGNAL
    │ hourly close < shortTol
    ▼
AWAITING_SHORT ──entry SL-M @ day's low──►  SHORT
```

Open LONG/SHORT: no new entries until flat. At **13:15 IST** on days **after** entry (`createdAt` date ≠ today), trail SL toward EMA (`generateSignal`). Every minute, 1-minute candles detect SL breach or entry trigger (`updateSL`).

EOD (~16:15 EMA job, `hour === 16`): pending AWAITING_LONG/SHORT reset to AWAITING_SIGNAL; no new signal from the 16:15 bar.

---

## 5. Entry (T-day)

Evaluated at hourly closes **10:15–15:15 IST** (`calculateEMA` cron `15 10-16 * * *`, then skip 16:15 for new signals).

### Long

1. `lastClose > ema * 1.002` (with default buffer)
2. **Do not market-buy.** Set:
   - `entryPoint = day's high` (rounded)
   - `stoploss = min(ema, day's low)` (rounded)
3. Place **SL** BUY at `entryPoint` (or MARKET if LTP already through)
4. Status `AWAITING_LONG` until a 1-minute bar’s **high ≥ entryPoint**
5. Then status `LONG` and place the protective SL SELL (limit 5 below trigger)

### Short

Mirror: `lastClose < ema * 0.998`, enter on **day’s low**, SL = `max(ema, day's high)`.

### Signal invalidation (still AWAITING_*)

| Condition | Action |
|---|---|
| Hourly close through the **signal SL** | Cancel pending entry; back to AWAITING_SIGNAL; re-run signal this hour |
| Close on the **opposite** signal band | Set `isSignalBreachingTolerance` |
| Opposite band still true **next** hourly evaluation | Invalidate (the “2 hours” rule) |
| 16:15 with a pending entry | Reset; do not carry the trigger overnight |

This matches the rule book: immediate invalidate if close beyond SL, and two hours on the wrong side of the opposite 0.2% band.

---

## 6. Stops after you are in

### T-day

Do **not** run the 09:16 T1 matrix on the entry day. Intraday risk is the signal SL on the broker, plus minute-bar flatten if that SL is traded through (`candle.low/high` vs `stoploss`).

### T+1 at 09:16 (`updateSL`, `OPEN_MINUTES = 9*60+16`)

Uses last close vs EMA and T1 bands. **Long** (code in `processUpdateSL`):

| 09:16 close | New SL / action |
|---|---|
| `close >= longT1` | SL = max(old, EMA) |
| `EMA <= close <= longT1` | SL = max(old, round((prevDayLow + EMA) / 2)) |
| `shortT1 <= close <= EMA` | SL = max(old, day's low so far) |
| `close <= shortT1` | **Exit MARKET** (CMP) |

**Short:** mirrored (`min` instead of `max`; prev **high**; exit if close **≥ longT1**).

Prev-day high/low come from the stored EMA row for the previous trading day (`highestHigh` / `lowestLow`), not a separate daily candle request.

### Later days (not T+1 morning branch)

If the position’s `createdAt` date is not the previous trading day, morning update sets SL to EMA (only in the favourable direction: `max`/`min` with old SL).

### 13:15 trail

Hourly EMA job at **13:15** (`hour === 13`) on a **later calendar day** than entry: SL = `max(ema, sl)` (long) or `min(ema, sl)` (short), and replace the broker SL.

Rule book: adjust at **09:16 and 13:15**, not on T-day. This app’s 13:15 path skips T-day via `createdAt` date.

### Expiry 15:00

Chase is a continuous futures book:

- If already LONG/SHORT in the **front** month on expiry day, flatten that contract at **15:00 IST** and reopen the **next** month MARKET, SL = next contract’s EMA.
- If still **flat** (AWAITING_SIGNAL) on expiry day, new signals evaluate and enter the **next** month immediately (`instruments[1]`). Do not open the dying front month only to roll it a few hours later.

---

## 7. Scheduling (this app)

| Job | Cron (IST) | Role |
|---|---|---|
| `calculateEMA` | `15 10-16 * * *` | Hourly HLC3 EMA, then `generateSignal` |
| `updateSL` | `0 * 9-15 * * *` (every minute 09:00–15:xx) | 09:16 T1, 15:00 rollover, minute SL/entry |

Windows: roughly 09:16–15:29 for SL updates (`OPEN_MINUTES` / `CLOSE_MINUTES`). Weekends/holidays: Kite candles / `getPreviousTradingDay`; there is no separate `holidays` Python list.

Paper/mock: `MOCK_ORDERS` + Desk execution mode. Unlike chase-bot, there is no `paper_trade_allow_outside_market_hours` flag on Chase itself.

---

## 8. Code map

| Piece | File |
|---|---|
| Hourly signal + pending invalidation | `lib/chaseSignal.ts` |
| Minute SL, 09:16 T1, rollover | `lib/queue-processor/chaseQueue.ts` |
| EMA | `lib/ema.ts`, `calculateEma` in `kiteUtils.ts` |
| Defaults / pause helpers | `lib/chaseDefaults.ts`, `lib/chaseSettings.ts` |
| Schedulers | `addToChaseQueue` in `lib/queue.ts` |
| UI | `pages/chase.tsx` |

Desk → Signals stores hourly EMA compares (including WAIT). Alerts fire on missing futures or bad candles.

---

## 9. FAQ

**Why SL-M entry instead of a market order on the hourly close?** The rule book waits for a **break of the day’s high/low** after the signal. The Python chase-bot market-enters on the close; this app does not.

**What is T1 (0.4%) for?** Next-morning stop **placement**, not the entry trigger. Chase-bot’s STRATEGY.md treats T1 as optional visualisation and uses a **different** stop (mid of EMA and prev day high/low) **on entry** — that is not the rule book and not this app.

**Can I run three indexes?** Yes. Each selected index is an independent book.

**Is 16:15 a trading bar?** EMA is stored; new entries are skipped (`hour === 16`).
