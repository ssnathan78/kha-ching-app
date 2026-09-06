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
          "These are same-session option structures. You either punch them now from the strategy page, or the weekday plan schedules them at the saved run time.",
          "They use MIS by default and can auto square-off before the close. Each weekday holds at most one template per strategy.",
        ],
      },
      {
        id: "continuous",
        title: "Continuous — Chase",
        body: [
          "Chase is a Nifty futures process that keeps running across days. It is not a weekday template.",
          "There is a single lots + engine configuration. Pause skips new entries after the current position is flat; resume allows the next signal.",
          "Kill intraday on the dashboard does not pause Chase. Kill all (incl. Chase) does.",
        ],
      },
      {
        id: "ledger",
        title: "Desk — orders, positions, history",
        body: [
          "Dashboard Today is still the live punch board. Desk is the application ledger: decisions, order lifecycle, fills, positions, completed round-trips, and audit events.",
          "Desk → Orders is only the blotter: instructions that reached placeOrder (paper, mock, live, or reconciled). A Sunday or after-hours live “Schedule now” never creates an order. That reject is on Desk → Alerts. Mock punches still need at least one index ticked; otherwise nothing is sent.",
          "Desk → Alerts is the operator log for silent fails: schedule rejects, queue/job failures, stale square-off discards, risk blocks, broker rejects, Chase data miss, and unresolved recon. The sidebar badge is the unread error count. Filter All / Today / Before today. Clear hides those rows without deleting the ledger.",
          "Desk → Signals is the persisted evaluation log: Chase hourly EMA vs close (including waiting for signal), straddle skew samples, strangle strike picks. Filter by strategy, weekday plan, or a single job. Clear today / before today / all deletes those signal rows.",
          "Kite remains the broker's execution reality. Reconcile with broker compares the ledger to Kite and records mismatches instead of silently rewriting history.",
          "A signal is not an order. An order is not a fill. A fill is not a position. A position is not a completed trade. Desk keeps those records separate so a restart can reconstruct what happened.",
          "Desk → Risk is the only place trading limits live: live-order switch, per-strategy max lots, daily loss, drawdown, and position caps. Strategies do not share P&L for those limits. Halt new entries is still the emergency stop. Flatten and stop-loss orders are still allowed while halted.",
        ],
      },
      {
        id: "plan",
        title: "Trade plan vs punch now",
        body: [
          "Trade plan stores weekday templates. Dashboard → Today's plan turns today's weekday into live jobs.",
          "Straddle / Strangle in the sidebar are for punching (or scheduling) right now, without waiting for the weekday template.",
          "Dashboard Today has two emergency buttons: Kill intraday flattens today's straddles and strangles only. Kill all also pauses Chase and tries to flatten Chase futures. Chase is often a hedge for long ETFs — use Kill all only when you mean it.",
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
      "Sell (or buy) the at-the-money call and put together. Short volatility by default. Same session.",
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
          "Lots: number of option lots per leg.",
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
          "Fixed SL %: stop-loss on each leg as a percent of entry premium.",
          "Combined premium exit: flatten when total premium moves by a threshold.",
          "Hedge: optional far OTM long options to cap tail risk.",
          "Max loss / max profit (points): strategy-level exits in option points, not rupees. The dashboard still shows rupee P&L separately.",
          "Trail-up %: after max profit is hit, the target can be raised by this percent.",
        ],
      },
      {
        id: "timing",
        title: "Timing",
        body: [
          "Schedule run: when the weekday job (or punch-now job) should start looking for entry.",
          "Auto square off: flatten remaining legs at this clock time (Asia/Kolkata).",
          "Rollback: what to do if a hedge, primary, or exit order breaks.",
        ],
      },
    ],
  },
  strangle: {
    title: "Strangle",
    summary:
      "Call and put struck away from spot, so you collect (or pay) less premium than an ATM straddle, with a wider break-even.",
    sections: [
      {
        id: "contract",
        title: "Contract",
        body: [
          "Same name vs index split as the straddle: name is a label; index is the chain.",
          "Inverted strangle: swaps the usual OTM wings (used when you want the opposite skew treatment).",
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
          "Same family of stops and hedges as the straddle. New templates default to a per-leg stop. NO_SL is allowed only if auto square-off is also on.",
        ],
      },
      {
        id: "timing",
        title: "Timing",
        body: [
          "Same-session schedule and square-off. This is not Chase — it does not hold Nifty futures overnight by design.",
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
          "How many futures lots to trade on each selected index. The Desk → Risk Chase max-lots cap can reject a save that is too large.",
          "Pause: after the current LONG/SHORT is exited, do not enter again. Pending entry triggers are cancelled. Resume turns entries back on.",
        ],
      },
      {
        id: "ema",
        title: "EMA period",
        body: [
          "Length of the exponential moving average on hourly typical price (H+L+C)/3. Shipped value is 40.",
          "A longer period is slower and filters noise; a shorter period turns more often.",
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
    ],
  },
}

export const HELP_TOPICS = Object.keys(HELP_PAGES) as HelpTopic[]
