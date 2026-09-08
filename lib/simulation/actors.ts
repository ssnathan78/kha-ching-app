import dayjs from "dayjs"
import timezone from "dayjs/plugin/timezone"
import utc from "dayjs/plugin/utc"

import { chaseAllowsNewEntry, chaseTolerances } from "../chaseDefaults"
import { IST_TZ } from "../marketCalendar"

dayjs.extend(utc)
dayjs.extend(timezone)

import { CHASE_STATUS } from "../constants"
import { isChaseWindow, isSessionOpen } from "../marketCalendar"
import { moneyToNumber } from "../trading/money"
import { DEFAULT_RISK_SETTINGS, evaluateOrder, type RiskSettings } from "../trading/riskEngine"
import type { Side } from "../trading/types"
import { isMarketOpen } from "../utils"
import type { PortfolioBook } from "./book"
import type { PlaceOrderInput, SimulatedExchange } from "./broker"
import { quoteIsTradeable, type SimulatedMarket } from "./market"
import type { ActorConfig, RiskEvent, SignalEvent } from "./types"

export type ActorRuntime = {
  config: ActorConfig
  chaseStatus: string
  fired: boolean
  legStopped: Record<string, boolean>
}

type ActorCtx = {
  nowMs: number
  market: SimulatedMarket
  broker: SimulatedExchange
  book: PortfolioBook
  paperLedger: PortfolioBook
  liveLedger: PortfolioBook
  settings: RiskSettings
  paperRisk: boolean
  recentOrderCount: number
}

export function createActorRuntime(config: ActorConfig): ActorRuntime {
  return {
    config: { enabled: true, paused: false, ...config },
    chaseStatus: CHASE_STATUS.AWAITING_SIGNAL,
    fired: false,
    legStopped: {},
  }
}

export function runActors(args: {
  actors: ActorRuntime[]
  nowMs: number
  market: SimulatedMarket
  broker: SimulatedExchange
  book: PortfolioBook
  paperLedger: PortfolioBook
  liveLedger: PortfolioBook
  settings: RiskSettings
  paperRisk: boolean
  recentOrderCount: number
}): { signals: SignalEvent[]; risk: RiskEvent[]; errors: string[] } {
  const signals: SignalEvent[] = []
  const risk: RiskEvent[] = []
  const errors: string[] = []

  for (const actor of args.actors) {
    if (actor.config.enabled === false) continue
    try {
      if (actor.config.kind === "chase") {
        stepChase(actor, args, signals, risk)
      } else if (actor.config.kind === "straddle" || actor.config.kind === "strangle") {
        stepTimeEntry(actor, args, signals, risk)
      }
    } catch (e) {
      errors.push(`${actor.config.strategy}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { signals, risk, errors }
}

function workingEntry(ctx: ActorCtx, symbol: string, side: Side): boolean {
  return [...ctx.broker.orders.values()].some(
    o =>
      o.symbol === symbol &&
      o.side === side &&
      o.role === "ENTRY" &&
      !["FILLED", "CANCELLED", "REJECTED", "EXPIRED", "FAILED"].includes(o.status)
  )
}

function stepChase(
  actor: ActorRuntime,
  ctx: ActorCtx,
  signals: SignalEvent[],
  risk: RiskEvent[]
): void {
  const { config } = actor
  if (!isChaseWindow(ctx.nowMs)) return
  const quote = ctx.market.get(config.symbol)
  if (!quoteIsTradeable(quote, ctx.nowMs, 180) || !quote) {
    if (quote && !quoteIsTradeable(quote, ctx.nowMs, 180)) {
      risk.push({
        at: ctx.nowMs,
        code: "STALE_DATA",
        message: "Chase skipped invalid/stale candle",
        strategy: config.strategy,
        symbol: config.symbol,
      })
    }
    return
  }

  const paused = Boolean(config.paused)
  const ema = config.ema ?? quote.last
  const { longTolerance, shortTolerance } = chaseTolerances(ema, config.bufferPercent ?? 0.2)
  const high = config.highestHigh ?? quote.high
  const low = config.lowestLow ?? quote.low
  const qty = config.lots * 65
  const bookQty = ctx.book.qty(config.symbol)

  if (actor.chaseStatus === CHASE_STATUS.AWAITING_LONG && bookQty > 0) {
    actor.chaseStatus = CHASE_STATUS.LONG
  }
  if (actor.chaseStatus === CHASE_STATUS.AWAITING_SHORT && bookQty < 0) {
    actor.chaseStatus = CHASE_STATUS.SHORT
  }

  if (actor.chaseStatus === CHASE_STATUS.AWAITING_SIGNAL) {
    if (!chaseAllowsNewEntry(paused)) return
    if (quote.last > longTolerance) {
      signals.push(
        signal(
          ctx.nowMs,
          config,
          "BUY",
          "AWAITING_LONG",
          `last ${quote.last} > long ${longTolerance}`
        )
      )
      const placed = maybeEnter(ctx, config, "BUY", high, qty, "SL-M", risk)
      actor.chaseStatus = placed ? CHASE_STATUS.AWAITING_LONG : CHASE_STATUS.AWAITING_SIGNAL
    } else if (quote.last < shortTolerance) {
      signals.push(
        signal(
          ctx.nowMs,
          config,
          "SELL",
          "AWAITING_SHORT",
          `last ${quote.last} < short ${shortTolerance}`
        )
      )
      const placed = maybeEnter(ctx, config, "SELL", low, qty, "SL-M", risk)
      actor.chaseStatus = placed ? CHASE_STATUS.AWAITING_SHORT : CHASE_STATUS.AWAITING_SIGNAL
    }
    return
  }

  if (
    (actor.chaseStatus === CHASE_STATUS.LONG || actor.chaseStatus === CHASE_STATUS.SHORT) &&
    bookQty === 0
  ) {
    actor.chaseStatus = CHASE_STATUS.AWAITING_SIGNAL
    return
  }

  if (actor.chaseStatus === CHASE_STATUS.LONG && quote.low <= (config.lowestLow ?? ema)) {
    const flattenQty = Math.abs(bookQty)
    if (flattenQty === 0) {
      actor.chaseStatus = CHASE_STATUS.AWAITING_SIGNAL
      return
    }
    signals.push(signal(ctx.nowMs, config, "SELL", "SL", "long stop"))
    maybeEnter(ctx, config, "SELL", quote.last, flattenQty, "MARKET", risk, "FLATTEN")
    actor.chaseStatus = CHASE_STATUS.AWAITING_SIGNAL
  }
  if (actor.chaseStatus === CHASE_STATUS.SHORT && quote.high >= (config.highestHigh ?? ema)) {
    const flattenQty = Math.abs(bookQty)
    if (flattenQty === 0) {
      actor.chaseStatus = CHASE_STATUS.AWAITING_SIGNAL
      return
    }
    signals.push(signal(ctx.nowMs, config, "BUY", "SL", "short stop"))
    maybeEnter(ctx, config, "BUY", quote.last, flattenQty, "MARKET", risk, "FLATTEN")
    actor.chaseStatus = CHASE_STATUS.AWAITING_SIGNAL
  }
}

function optionLegs(config: ActorConfig): string[] {
  return config.legSymbols?.length ? config.legSymbols : [config.symbol]
}

function parseHmm(value: string): number {
  const [hh, mm] = value.split(":").map(Number)
  return hh * 60 + mm
}

function stepTimeEntry(
  actor: ActorRuntime,
  ctx: ActorCtx,
  signals: SignalEvent[],
  risk: RiskEvent[]
): void {
  const fireMin = parseHmm(actor.config.fireAt ?? "09:20")
  const slm = actor.config.slmPercent
  const squareOffAt = actor.config.squareOffAt
  const legs = optionLegs(actor.config)
  const ist = dayjs(ctx.nowMs).tz(IST_TZ)
  const istMin = ist.hour() * 60 + ist.minute()

  if (!actor.fired) {
    if (istMin < fireMin) return
    if (!isSessionOpen(ctx.nowMs) && !ctx.paperRisk) return
    if (ctx.paperRisk && !isSessionOpen(ctx.nowMs) && !process.env.MOCK_ORDERS) return

    actor.fired = true
    const qty = actor.config.lots * (actor.config.lotSize ?? 65)
    for (const symbol of legs) {
      signals.push(
        signal(
          ctx.nowMs,
          actor.config,
          "SELL",
          "ENTRY",
          `${actor.config.kind} scheduled entry`,
          symbol
        )
      )
      maybeEnter(
        ctx,
        actor.config,
        "SELL",
        ctx.market.get(symbol)?.last ?? 0,
        qty,
        "MARKET",
        risk,
        "ENTRY",
        symbol
      )
    }
    return
  }

  if (slm != null) {
    for (const symbol of legs) {
      if (actor.legStopped[symbol]) continue
      const qty = ctx.book.qty(symbol)
      if (qty >= 0) continue
      const quote = ctx.market.get(symbol)
      if (!quote) continue
      const avg = moneyToNumber(ctx.book.positions.get(symbol)?.averagePrice)
      if (!Number.isFinite(avg) || avg <= 0) continue
      if (quote.last < avg * (1 + slm / 100)) continue
      signals.push(signal(ctx.nowMs, actor.config, "BUY", "SL", "9:20 per-leg stop", symbol))
      maybeEnter(ctx, actor.config, "BUY", quote.last, Math.abs(qty), "MARKET", risk, "SL", symbol)
      actor.legStopped[symbol] = true
    }
  }

  if (!squareOffAt) return
  const squareMin = parseHmm(squareOffAt)
  if (istMin < squareMin) return
  for (const symbol of legs) {
    const qty = ctx.book.qty(symbol)
    if (qty === 0) continue
    const side = qty < 0 ? "BUY" : "SELL"
    signals.push(signal(ctx.nowMs, actor.config, side, "EXIT", "auto square-off", symbol))
    maybeEnter(
      ctx,
      actor.config,
      side,
      ctx.market.get(symbol)?.last ?? 0,
      Math.abs(qty),
      "MARKET",
      risk,
      "EXIT",
      symbol
    )
    actor.legStopped[symbol] = true
  }
}

function maybeEnter(
  ctx: ActorCtx,
  config: ActorConfig,
  side: Side,
  triggerOrPx: number,
  quantity: number,
  orderType: PlaceOrderInput["orderType"],
  risk: RiskEvent[],
  role: "ENTRY" | "FLATTEN" | "SL" | "EXIT" = "ENTRY",
  symbol = config.symbol
): boolean {
  if (quantity <= 0) return false
  if (role === "ENTRY" && workingEntry(ctx, symbol, side)) return false
  const other = ctx.paperRisk ? ctx.liveLedger : ctx.paperLedger
  if (role === "ENTRY" && other.qty(symbol) !== 0) {
    risk.push({
      at: ctx.nowMs,
      code: config.strategy === "CHASE" ? "CHASE_OTHER_BOOK" : "OTHER_BOOK",
      message: "Will not punch this book while the other paper/live book is still open",
      strategy: config.strategy,
      symbol,
    })
    return false
  }
  const quote = ctx.market.get(symbol)
  const settings: RiskSettings = {
    ...DEFAULT_RISK_SETTINGS,
    ...ctx.settings,
    strategies: ctx.settings.strategies,
  }
  const decision = evaluateOrder(
    {
      role,
      tradingsymbol: symbol,
      quantity,
      side,
      orderType,
      tag: config.kind,
      ltp: quote?.last,
      ltpAt: quote ? new Date(quote.ts) : null,
      strategy: config.strategy,
      lots: config.lots,
    },
    {
      settings,
      now: new Date(ctx.nowMs),
      isMock: ctx.paperRisk,
      isPaper: ctx.paperRisk,
      marketOpen: isMarketOpen(),
      jobAborted: false,
      openPositionCount: [...ctx.book.positions.values()].filter(p => p.quantity !== 0).length,
      openOrderCount: [...ctx.broker.orders.values()].filter(
        o => !["FILLED", "CANCELLED", "REJECTED", "EXPIRED", "FAILED"].includes(o.status)
      ).length,
      recentOrderCount: ctx.recentOrderCount,
      pendingDuplicate: false,
    }
  )
  if (!decision.ok) {
    risk.push({
      at: ctx.nowMs,
      code: decision.code,
      message: decision.message,
      strategy: config.strategy,
      symbol,
    })
    return false
  }
  ctx.broker.placeOrder(
    {
      symbol,
      side,
      quantity,
      orderType,
      triggerPrice:
        orderType === "SL-M" || orderType === "SL" || orderType === "SL-L" ? triggerOrPx : null,
      price: orderType === "SL-L" ? triggerOrPx : null,
      tag: config.kind,
      role,
      strategy: config.strategy,
      provenance: ctx.paperRisk ? "PAPER" : "LIVE",
      clientKey: `${config.kind}:${symbol}:${side}:${quantity}:${role}:${ctx.nowMs}`,
    },
    ctx.market,
    ctx.nowMs
  )
  return true
}

function signal(
  at: number,
  config: ActorConfig,
  side: Side,
  kind: string,
  reason: string,
  symbol = config.symbol
): SignalEvent {
  return { at, strategy: config.strategy, symbol, side, kind, reason }
}
