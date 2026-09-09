import dayjs from "dayjs"
import timezone from "dayjs/plugin/timezone"
import utc from "dayjs/plugin/utc"

import { resetClock, SimClock, setClock } from "../clock"
import { IST_TZ, isSessionOpen, marketSessionState } from "../marketCalendar"
import { moneyToNumber } from "../trading/money"
import { DEFAULT_RISK_SETTINGS, RISK_STRATEGY_KEYS, type RiskSettings } from "../trading/riskEngine"
import { createActorRuntime, runActors } from "./actors"
import { PortfolioBook } from "./book"
import { SimulatedBrokerError, SimulatedExchange } from "./broker"
import { resolveScenario } from "./catalog"
import { activeFailure, applyFailure } from "./failures"
import { collectInvariantViolations, evaluateAssertions } from "./invariants"
import { assertSimulationSafe } from "./isolation"
import { SimulatedMarket } from "./market"
import { applyOvernightGap, samplePricePath } from "./pricePath"
import { createRng } from "./rng"
import type {
  FillEvent,
  JournalEvent,
  RiskEvent,
  SignalEvent,
  SimResult,
  SimulateConfig,
} from "./types"

dayjs.extend(utc)
dayjs.extend(timezone)

export function simulate(input: Partial<SimulateConfig> & { scenario?: string }): SimResult {
  assertSimulationSafe("simulate")
  const started = Date.now()
  const config = resolveScenario(input)
  const rng = createRng(config.seed)
  const clock = new SimClock(config.start)
  setClock(clock)

  const market = new SimulatedMarket({
    calendar: config.calendar,
    liquidity: config.liquidity ?? "normal",
    spreadPoints: config.spreadPoints,
  })
  if (config.forcedSession) market.setForcedSession(config.forcedSession)

  const broker = new SimulatedExchange({
    feeBps: config.feeBps ?? 0,
    slippage: config.slippage ?? { mode: "zero" },
    rng,
  })
  const book = new PortfolioBook()
  const paperLedger = new PortfolioBook()
  const liveLedger = new PortfolioBook()
  const actors = (config.actors ?? []).map(createActorRuntime)
  let settings: RiskSettings = {
    ...DEFAULT_RISK_SETTINGS,
    ...config.risk,
    strategies: {
      ...DEFAULT_RISK_SETTINGS.strategies,
      ...(config.risk?.strategies ?? {}),
    },
  }

  const signals: SignalEvent[] = []
  const riskEvents: RiskEvent[] = []
  const errors: string[] = []
  const warnings: string[] = []
  const journal: JournalEvent[] = []
  let paperRisk = config.paperRisk !== false

  const start = dayjs.tz(config.start, IST_TZ)
  const end = dayjs.tz(config.end, IST_TZ)
  const stepMin = config.stepMinutes ?? 5
  const totalMs = Math.max(1, end.valueOf() - start.valueOf())
  let ticks = 0
  let lastDay = start.format("YYYY-MM-DD")
  let restarted = false

  try {
    while (!clock.ist().isAfter(end)) {
      const nowMs = clock.nowMs()
      const ist = clock.ist()
      const nowIso = ist.format("YYYY-MM-DD HH:mm")
      ticks += 1

      for (const sched of config.riskSchedule ?? []) {
        if (sched.at !== nowIso) continue
        if (sched.paperRisk != null && sched.paperRisk !== paperRisk) {
          const goingLive = paperRisk && sched.paperRisk === false
          if (goingLive) {
            archivePaperTrial(book, paperLedger, liveLedger, broker, nowMs)
          }
          for (const actor of actors) {
            if (actor.config.kind !== "chase") actor.fired = false
            if (goingLive && actor.config.kind === "chase") {
              actor.chaseStatus = "AWAITING_SIGNAL"
            }
          }
          paperRisk = sched.paperRisk
        }
        if (sched.risk) {
          const strategies = { ...settings.strategies }
          if (sched.risk.strategies) {
            for (const key of RISK_STRATEGY_KEYS) {
              if (sched.risk.strategies[key]) {
                strategies[key] = { ...strategies[key], ...sched.risk.strategies[key] }
              }
            }
          }
          settings = { ...settings, ...sched.risk, strategies }
        }
        journal.push({
          at: nowMs,
          type: "risk_schedule",
          detail: { at: nowIso, paperRisk, executionMode: settings.strategies.CHASE.executionMode },
        })
      }

      for (const sched of config.sessionSchedule ?? []) {
        if (sched.at === nowIso) market.setForcedSession(sched.state)
      }

      const session = market.sessionAt(nowMs)
      const day = ist.format("YYYY-MM-DD")
      const crossed = day !== lastDay
      lastDay = day

      const progress = (nowMs - start.valueOf()) / totalMs
      for (const inst of config.instruments) {
        let mid = inst.startPrice
        if (crossed && (config.pricePath === "gap_up" || config.pricePath === "gap_down")) {
          mid = applyOvernightGap(inst.startPrice, inst.pricePath ?? config.pricePath, rng)
        } else {
          mid = samplePricePath({
            kind: inst.pricePath ?? config.pricePath ?? "sideways",
            progress,
            start: inst.startPrice,
            rng,
            volatility: config.volatility ?? "normal",
          }).mid
        }
        const defect =
          config.defects?.find(d => d.at === nowIso && d.symbol === inst.symbol)?.defect ?? "none"
        market.setQuote(inst.symbol, mid, nowMs, defect)
      }

      const fail = activeFailure(config.failures, nowIso)
      applyFailure(broker, fail)
      if (fail === "database_down") {
        warnings.push(`${nowIso}: database unavailable (injected)`)
      }
      if (fail === "redis_down") {
        warnings.push(`${nowIso}: redis unavailable (injected)`)
      }

      if (config.restartAt === nowIso && !restarted) {
        const snap = broker.snapshot()
        const bookSnap = book.clone()
        const paperSnap = paperLedger.clone()
        const liveSnap = liveLedger.clone()
        broker.restore(snap)
        restoreBook(book, bookSnap)
        restoreBook(paperLedger, paperSnap)
        restoreBook(liveLedger, liveSnap)
        restarted = true
        journal.push({ at: nowMs, type: "restart", detail: { at: nowIso } })
      }

      const open =
        session === "OPEN" && isSessionOpen(nowMs, config.calendar?.extraHolidays, config.calendar)
      if (session === "HALTED" || session === "SUSPENDED") {
        journal.push({ at: nowMs, type: "session", detail: { session } })
      } else {
        try {
          const fills = broker.step(market, nowMs, open)
          applySplitFills(book, paperLedger, liveLedger, fills)
        } catch (e) {
          errors.push(errMsg(e))
        }
      }

      const recent = [...broker.orders.values()].filter(o => nowMs - o.createdAt <= 60_000).length
      try {
        const out = runActors({
          actors,
          nowMs,
          market,
          broker,
          book: paperRisk ? paperLedger : liveLedger,
          paperLedger,
          liveLedger,
          settings,
          paperRisk,
          recentOrderCount: recent,
        })
        signals.push(...out.signals)
        riskEvents.push(...out.risk)
        errors.push(...out.errors)
        const more = broker.step(market, nowMs, open)
        applySplitFills(book, paperLedger, liveLedger, more)
        applySplitFills(book, paperLedger, liveLedger, broker.fills)
      } catch (e) {
        if (e instanceof SimulatedBrokerError) {
          errors.push(`${e.code}: ${e.message}`)
          journal.push({
            at: nowMs,
            type: "broker_error",
            detail: { code: e.code, message: e.message },
          })
        } else {
          errors.push(errMsg(e))
        }
      }

      if (fail === "worker_crash") {
        warnings.push(`${nowIso}: worker crash injected — tick skipped after actors`)
      }

      clock.add(stepMin, "minute")
    }
  } finally {
    resetClock()
  }

  const marks = new Map<string, number>()
  for (const q of market.snapshot()) marks.set(q.symbol, q.last)
  const positions = book.snapshot(marks)
  const portfolio = book.totals(marks)
  const orders = [...broker.orders.values()]

  const invariantViolations = collectInvariantViolations({
    broker,
    book,
    market,
    nowMs: end.valueOf(),
    paperRisk,
    allowOrdersWhenClosed: Boolean(config.allowOrdersWhenClosed),
    halted: Boolean(settings.deskHalted),
  })

  const assertionResults = evaluateAssertions(
    { orders, fills: broker.fills, positions, riskEvents, portfolio },
    config.assertions ?? []
  )

  return {
    scenario: config.scenario,
    seed: config.seed,
    start: config.start,
    end: config.end,
    marketConditions: {
      pricePath: config.pricePath ?? "sideways",
      volatility: config.volatility ?? "normal",
      liquidity: config.liquidity ?? "normal",
    },
    signals,
    orders,
    fills: broker.fills,
    positions,
    portfolio,
    riskEvents,
    errors,
    warnings,
    journal,
    assertionResults,
    invariantViolations,
    finalState: {
      session: marketSessionState(end.valueOf(), config.calendar?.extraHolidays, config.calendar),
      ticks,
      restarted,
      actorStatus: actors.map(a => ({
        strategy: a.config.strategy,
        chaseStatus: a.chaseStatus,
        fired: a.fired,
      })),
      paperQty: qtyBySymbol(paperLedger),
      liveQty: qtyBySymbol(liveLedger),
    },
    elapsedMs: Date.now() - started,
    ticks,
  }
}

function archivePaperTrial(
  combined: PortfolioBook,
  paper: PortfolioBook,
  live: PortfolioBook,
  broker: SimulatedExchange,
  nowMs: number
): void {
  for (const order of broker.orders.values()) {
    if (order.provenance === "LIVE") continue
    if (["FILLED", "CANCELLED", "REJECTED", "EXPIRED", "FAILED"].includes(order.status)) continue
    order.status = "CANCELLED"
    order.updatedAt = nowMs
  }
  const fills: FillEvent[] = []
  for (const [symbol, pos] of paper.positions) {
    if (!pos.quantity) continue
    fills.push({
      fillId: `paper-archive:${symbol}:${nowMs}`,
      orderId: `paper-archive:${symbol}:${nowMs}`,
      symbol,
      side: pos.quantity > 0 ? "SELL" : "BUY",
      quantity: Math.abs(pos.quantity),
      price: moneyToNumber(pos.averagePrice) || 0,
      fee: 0,
      at: nowMs,
      provenance: "PAPER",
    })
  }
  if (fills.length === 0) return
  broker.fills.push(...fills)
  applySplitFills(combined, paper, live, fills)
}

function applyFills(book: PortfolioBook, fills: FillEvent[]): void {
  const seen = new Set(book.fills.map(f => f.fillId))
  for (const fill of fills) {
    if (!seen.has(fill.fillId)) {
      book.applyFill(fill)
      seen.add(fill.fillId)
    }
  }
}

function applySplitFills(
  combined: PortfolioBook,
  paper: PortfolioBook,
  live: PortfolioBook,
  fills: FillEvent[]
): void {
  applyFills(combined, fills)
  applyFills(
    paper,
    fills.filter(f => f.provenance !== "LIVE")
  )
  applyFills(
    live,
    fills.filter(f => f.provenance === "LIVE")
  )
}

function restoreBook(target: PortfolioBook, snap: PortfolioBook): void {
  target.positions.clear()
  for (const [sym, pos] of snap.positions) target.positions.set(sym, { ...pos })
  target.fills = snap.fills.map(f => ({ ...f }))
}

function qtyBySymbol(book: PortfolioBook): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [symbol, pos] of book.positions) {
    if (pos.quantity !== 0) out[symbol] = pos.quantity
  }
  return out
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
