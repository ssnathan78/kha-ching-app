export type HelpTopic = "desk" | "plan" | "straddle" | "strangle" | "chase"

export type HelpPage = {
  title: string
  summary: string
  sections: { id: string; title: string; body: string[] }[]
}

export const HELP_PAGES: Record<HelpTopic, HelpPage> = {
  desk: {
    title: "How the desk is organised",
    summary:
      "Kha-Ching is a personal algo desk for Indian index options and one Nifty futures chase. Intraday structures and Chase are not the same kind of trade.",
    sections: [
      {
        id: "intraday",
        title: "Intraday — Straddle and Strangle",
        body: [
          "These are same-session option structures (classic 9:20: sell CE and PE together, each with its own stop). You either punch them now from the strategy page, or the weekday plan schedules them at the saved run time.",
          "They use MIS by default. When one stop hits, the other wing stays until auto square-off. Each weekday holds at most one template per strategy.",
        ],
      },
      {
        id: "continuous",
        title: "Continuous — Chase",
        body: [
          "Chase is a Nifty futures process that keeps running across days. It is not a weekday template.",
          "There is a single lots + engine configuration. Pause skips new entries after the current position is flat; resume allows the next signal.",
          "Kill intraday on the dashboard does not pause Chase. Kill all (incl. Chase) does. Square off all open gets you out of current books without a halt; Chase can take the next signal.",
        ],
      },
      {
        id: "ledger",
        title: "Desk — orders, positions, history",
        body: [
          "Dashboard Today is still the live punch board. Desk is the application ledger: decisions, order lifecycle, fills, positions, completed round-trips, and audit events.",
          "Desk → Orders is only the blotter: instructions that reached placeOrder (paper, mock, live, or reconciled). A Sunday or after-hours live “Schedule now” never creates an order. That reject is on Desk → Alerts. Mock punches still need at least one index ticked; otherwise nothing is sent.",
          "Desk → Contracts shows the Kite NFO futures and option expiries the strategies will use today (front/next month FUT for Chase, current/next/monthly option dates for straddles and strangles). The contract list is fetched from Kite and cached until 07:00 IST — it is not a Postgres table. Chase stores only the selected indexes and, once in a trade, the tradingsymbol on chase_status.",
          "Desk → Alerts is the operator log for silent fails: schedule rejects, queue/job failures, stale square-off discards, risk blocks, broker rejects, Chase data miss, and unresolved recon. The sidebar badge is the unread error count. Filter All / Today / Before today. Clear hides those rows without deleting the ledger.",
          "Desk → Signals is the persisted evaluation log: Chase hourly EMA vs close (including waiting for signal), straddle skew samples, strangle strike picks. Filter by strategy, weekday plan, or a single job. Clear today / before today / all deletes those signal rows.",
          "Kite remains the broker's execution reality. Reconcile with broker compares the ledger to Kite and records mismatches instead of silently rewriting history. Square off on a position row (or on Today / Chase) sends a flatten for the open book. Clear phantom zeros a leftover ledger book after proving Kite is flat (or immediately for paper). It does not send an order and does not let you type a new qty.",
          "A signal is not an order. An order is not a fill. A fill is not a position. A position is not a completed trade. Desk keeps those records separate so a restart can reconstruct what happened.",
          "Desk → Risk is the only place trading limits live. Strategies do not share P&L for those limits. See Risk flags below for Allow live orders vs Trading enabled, and Strategy enabled vs Not halted. The Risk page also lists Chase and today's weekday-plan size next to max notional so a 2-lot Nifty future is not a surprise at punch.",
        ],
      },
      {
        id: "risk-flags",
        title: "Risk flags — live, trading, enabled, halt",
        body: [
          "Allow live orders is the Zerodha master switch. Off means paper and mock still work (quotes and the ledger). A live punch also needs MOCK_ORDERS=false in .env and that strategy's Execution set to Live. Squaring off an existing live book is still allowed so you can get out.",
          "Trading enabled is desk-wide new entries. Turn it off to stop straddles, strangles, and Chase from opening. Flatten and stop-loss still go through. Halt new entries on the desk header is the same idea with a stored reason; Resume is explicit and also turns trading back on.",
          "Strategy enabled is that book's on/off. Off rejects every order for that strategy, including stop-loss and flatten. Use this when you want that book completely dark.",
          "Not halted only blocks new entries (you halt it from Risk, or Kill desk). Flatten and stop-loss still work. Halt never auto-clears — uncheck Not halted, or Resume on the desk header for a desk-wide halt. Max lots and max open positions stay per strategy so a new entry is sized and not stacked on an existing book. Paper → Live archives that strategy’s paper trial (no Kite order) and resets Chase to AWAITING_SIGNAL. Save is rejected if Kite or the live ledger still has size. Live flatten never uses paper qty. Live → Paper is rejected while a live book is open. If a live ledger row is leftover and the broker is flat, Desk → Positions → Clear phantom zeros the app row without sending a Kite order.",
        ],
      },
      {
        id: "plan",
        title: "Trade plan vs punch now",
        body: [
          "Trade plan stores weekday templates. Dashboard → Today's plan turns today's weekday into live jobs.",
          "Straddle / Strangle in the sidebar are for punching (or scheduling) right now, without waiting for the weekday template.",
          "Dashboard Today has Square off on each active job, including Chase, plus Square off all open. Those flatten the current books without halting. Kill intraday is the emergency: flatten today's straddles and strangles and halt the desk. Kill all also pauses Chase. Chase is often a hedge for long ETFs — use Kill all only when you mean it.",
        ],
      },
    ],
  },
  plan: {
    title: "Weekday templates",
    summary:
      "One saved configuration per strategy per weekday. Browse by day or by strategy. Edit inline.",
    sections: [
      {
        id: "one",
        title: "One template per strategy per day",
        body: [
          "Monday Straddle is a single row. If a template already exists, use Edit — Add stays hidden.",
          "Copy to other days writes that saved row onto the other weekdays (creates or replaces).",
          "Reset to default reloads the master defaults from the database (seeded on first migrate, editable via Save as defaults).",
        ],
      },
      {
        id: "name-vs-index",
        title: "Template name vs index",
        body: [
          "Template name is only a label in the list.",
          "Index (Nifty / BankNifty / FinNifty) is what is actually traded. On the plan, pick exactly one index. On punch-now pages you may tick several; each tick is a separate order.",
        ],
      },
    ],
  },
  straddle: {
    title: "ATM straddle",
    summary:
      "Sell (or buy) the at-the-money call and put together. Starts delta-neutral. Same session; 9:20-style per-leg stops.",
    sections: [
      {
        id: "contract",
        title: "Contract",
        body: [
          "Template name: label only.",
          "Index: the option chain to use. Lot size on NSE is taken from the live contract when possible.",
          "Volatility type: short = sell both legs; long = buy both legs.",
          "Product: MIS is intraday; NRML carries overnight (unusual for this structure here).",
          "Expiry: current or next monthly/weekly (weekly UI is Nifty only).",
          "Lots: number of option lots per leg. The form shows quantity and, if you type an estimated premium, rupee notional vs Desk → Risk max notional.",
        ],
      },
      {
        id: "entry",
        title: "Entry / skew",
        body: [
          "ATM call and put premiums are rarely equal. Skew is the gap between those two prices.",
          "Ideal skew %: wait until the gap is this small (or smaller) before entering.",
          "Threshold skew %: if time is running out, accept a worse gap down to this floor.",
          "Skew checker minutes: how long to keep waiting.",
          "If skew never converges: either reject the trade or enter anyway.",
        ],
      },
      {
        id: "risk",
        title: "Risk",
        body: [
          "This is the classic 9:20 short straddle: sell ATM CE and PE together (delta-neutral at entry). Each leg has its own stop as a percent of that fill. Combined, Supertrend, and OBS trail exits are not available.",
          "When Nifty trends one way, only the losing wing's SL should hit. The other wing stays open on purpose until auto square-off — that leftover is a directional hold until EOD, not a naked miss.",
          "Chop that tags both stops is the contained worst case (two SL hits). True leftover risk is a one-legged fill (rollback) or a gap through the stop, not the trend leftover.",
          "No SL: time square-off only. Auto square-off must be on.",
          "Hedge: optional far OTM long options to cap tail risk.",
          "Max loss / max profit (points): strategy-level exits in option points, not rupees. The dashboard still shows rupee P&L separately.",
          "Trail-up %: after max profit is hit, the target can be raised by this percent.",
        ],
      },
      {
        id: "timing",
        title: "Timing",
        body: [
          "Schedule run: when the weekday job (or punch-now job) should start looking for entry. Classic 9:20 uses ~09:20 IST; the same per-leg exits apply at any run time.",
          "Auto square off: flatten whatever is still open at this clock time (Asia/Kolkata), including a leftover wing after one SL. Default is 15:20.",
          "Rollback: what to do if a hedge, primary, or exit order breaks. That is the real naked-short case (one leg filled, the other not).",
        ],
      },
    ],
  },
  strangle: {
    title: "Strangle",
    summary:
      "Call and put struck away from spot. Same 9:20 per-leg stops as the ATM straddle, with a wider break-even.",
    sections: [
      {
        id: "contract",
        title: "Contract",
        body: [
          "Same name vs index split as the straddle: name is a label; index is the chain.",
          "Inverted strangle: swaps the usual OTM wings (used when you want the opposite skew treatment).",
          "Lots: same as the straddle — the form previews quantity and notional vs the Desk cap if you type an estimated premium.",
        ],
      },
      {
        id: "entry",
        title: "Entry",
        body: [
          "Distance from ATM: number of strikes away from the ATM strike (1 = first OTM each side).",
          "Percent from ATM: strike chosen by % distance from spot.",
          "Option price: pick wings whose premium is near this rupee value.",
        ],
      },
      {
        id: "risk",
        title: "Risk",
        body: [
          "Same 9:20 exits as the straddle: each wing has its own SL %. A one-way Nifty day stops the losing wing only; the other stays until auto square-off. That leftover is intended.",
          "No SL is allowed only with auto square-off. Combined, Supertrend, and OBS trail exits are not available.",
        ],
      },
      {
        id: "timing",
        title: "Timing",
        body: [
          "Same-session schedule and square-off. A leftover option wing after one SL is held only until auto square-off, not overnight. This is not Chase.",
        ],
      },
    ],
  },
  chase: {
    title: "Chase",
    summary:
      "Index futures trend-follow around a long EMA. Pick Nifty, BankNifty, and/or FinNifty. Positions can stay open across sessions.",
    sections: [
      {
        id: "instruments",
        title: "Indexes",
        body: [
          "Tick every index you want Chase to trade. Each index has its own status, signals, and futures contract. Unticking an index stops new work on that book after the current position is managed.",
        ],
      },
      {
        id: "lots",
        title: "Lots",
        body: [
          "How many futures lots to trade on each selected index. The page shows lots × lot size × last hourly close so you can see rupee notional before an order. Desk → Risk max notional rejects the order if that size is over the cap.",
          "Pause: after the current LONG/SHORT is exited, do not enter again. Pending entry triggers are cancelled. Resume turns entries back on.",
          "Reset to fresh signal: use this when Chase shows LONG/SHORT or HOLD but no order filled (for example a MAX_NOTIONAL reject). It returns the engine to AWAITING_SIGNAL. It does not flatten an open futures book — use Square off current on this page, Today, or Desk → Positions.",
        ],
      },
      {
        id: "ema",
        title: "EMA period",
        body: [
          "Length of the exponential moving average on hourly typical price (H+L+C)/3. Shipped value is 40.",
          "A longer period is slower and filters noise; a shorter period turns more often.",
          "If an hourly EMA job was missed, the next hour continues from the last stored EMA rather than rebuilding from history. Desk shows CHASE_EMA_GAP. New entries that hour still run.",
        ],
      },
      {
        id: "buffer",
        title: "Buffer %",
        body: [
          "Close must be this percent above the EMA for a long setup, or this percent below for a short setup. Shipped value is 0.2 (that is 1.002× / 0.998× EMA).",
          "A larger buffer means fewer signals and more confirmation. Too large and the move is already gone.",
        ],
      },
      {
        id: "offset",
        title: "Entry limit offset",
        body: [
          "When the trigger is not yet traded, the desk places an SL order. The limit price is trigger plus this many rupees on buys, minus on sells. Shipped value is 5.",
          "This is not the strategy stop. The strategy stop is the EMA / day high-low logic in the Chase worker.",
        ],
      },
      {
        id: "open-classify",
        title: "09:16 morning classify",
        body: [
          "Default is PDF: at 09:16 IST, compare the 09:16 candle close (2-minute, or 1-minute if that is missing) to the overnight hourly EMA. Day's high/low till 09:16 come from those session bars. T+1 still uses the four T1 buckets; later days still trail the stop to EMA.",
          "Legacy is the older 60-minute bar that also steps 40-EMA on that stub hour. Keep it only to compare against the Anil kha-ching port.",
        ],
      },
    ],
  },
}

export const HELP_TOPICS = Object.keys(HELP_PAGES) as HelpTopic[]
