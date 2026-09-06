# ATM strangle (intraday)

### Technical specification — as implemented in Kha-Ching

---

## 1. Strategy overview

Sell (default) or buy a **call and put struck away from spot** on the same index expiry. Same family as the ATM straddle: short volatility by default, **wider break-evens**, **less premium** than ATM.

This is a **same-session** MIS structure (NRML allowed but unusual here). It is not Chase and does not hold index futures overnight by design.

**Edge hypothesis (operator intent):** OTM wings are rich vs the move you expect today. You are paid for a range; you lose if the index trends hard through a wing.

---

## 2. Universe

| Item | Rule |
|---|---|
| Indexes | Nifty and BankNifty on the default form. FinNifty is not in the strangle margin table; do not assume it is first-class |
| Product / side / expiry | Same as straddle: MIS/NRML, SHORT/LONG, current/next/(weekly Nifty) |
| ATM pivot | Same rounding as straddle: `round(LTP / step) * step` |
| One template | One weekday plan row per weekday |

The ATM strike is computed by **reusing** `getATMStraddle` with `takeTradeIrrespectiveSkew: true` and an already-expired skew window, so **strangle does not wait for CE/PE skew**. That is intentional: wings are not ATM.

---

## 3. Strike selection

`lib/strategies/strangleStrikes.ts` plus `getOTMStrangleByOptionPrice` for the price mode.

### 3.1 Distance from ATM (default)

`distanceFromAtm = 1` means one strike step each side:

```
PE strike = atmStrike - distance * strikeStepSize
CE strike = atmStrike + distance * strikeStepSize
```

### 3.2 Percent from ATM

```
PE = round((1 - pct/100) * atm / step) * step
CE = round((1 + pct/100) * atm / step) * step
```

Default `percentfromAtm` in code is `2` when the form omits it.

### 3.3 Option price

Pick OTM CE and PE whose last price is near `optionPrice` (default 20 rupees), not greater-than unless that helper is called that way. This hits Kite quotes; distance/percent do not.

### 3.4 Inverted strangle

Swaps the usual OTM assignment: PE uses the higher strike, CE the lower (`applyInvertedStrikes`). Use when you want the opposite skew treatment. Trading symbols for inverted legs are derived by replacing `CE`↔`PE` on the opposite-wing contract — that is a **string rewrite**, not a second chain lookup.

---

## 4. Inputs

| Knob | Default | Meaning |
|---|---|---|
| `entryStrategy` | `DISTANCE_FROM_ATM` | Distance / percent / price |
| `distanceFromAtm` | 1 | Strike steps from ATM |
| `optionPrice` | 20 | Target wing premium (price mode) |
| `inverted` | false | Swap wings |
| `lots` / `slmPercent` / product / expiry | Same family as straddle | See [ATM_STRADDLE.md](./ATM_STRADDLE.md) |
| `exitStrategy` | `INDIVIDUAL_LEG_SLM_1X` | Same implementation set: per-leg SL or `NO_SL` |
| Auto square-off | true | Same clock flatten |
| Hedge | optional | Far OTM longs off **each wing strike**, not ATM |
| Max loss / max profit | **not** in strangle default form | Can still be present if copied from a straddle-shaped payload |

Entry order type `STOP_LOSS_MARKET_ORDER` is labelled in the form catalog; **placement is MARKET** via `createOrder`. Do not assume a stop-entry for the wings.

---

## 5. Order flow

```
compute ATM pivot (no skew wait)
    │
    ├─ choose PE/CE strikes
    ├─ reject if market closed (live)
    ├─ optional hedges off each wing
    ├─ CE + PE MARKET
    ├─ margin check
    └─ same exit queues as straddle (if SL selected)
```

Signals logged: `STRIKE_SELECT` on Desk → Signals.

---

## 6. Exits

Same machinery as the straddle:

- Per-leg `slmPercent` SL-Limit
- Time square-off
- `NO_SL` only with auto square-off
- Combined / Supertrend / OBS **not implemented**
- Kill **intraday** includes strangle

If max-profit / max-loss flags are on the job, `targetPnL` still uses **points**.

---

## 7. Scheduling

Identical to straddle: weekday `/plan` or punch `/strat/strangle`. Default `runAt` 12:20 IST.

---

## 8. Code map

| Piece | File |
|---|---|
| Entry + hedges | `lib/strategies/strangle.ts` |
| Distance / percent / invert | `lib/strategies/strangleStrikes.ts` |
| ATM pivot | `getATMStraddle` in `atmStraddle.ts` |
| Price wings | `getOTMStrangleByOptionPrice` in `kiteUtils.ts` |
| Validation | `lib/strategyValidation.ts` |

In-app copy: `/help/strangle`.

---

## 9. FAQ

**Why no skew checker?** Wings are chosen by distance, percent, or premium, not by ATM CE≈PE.

**Is inverted the same as a strap/strip?** No. It only swaps which strike is the put vs call. Quantities stay 1:1 lots.

**Can I skip SL?** Only with auto square-off on. Naked NO_SL without a clock flatten is rejected at validation.
