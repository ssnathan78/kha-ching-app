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
}

export function createActorRuntime(config: ActorConfig): ActorRuntime {
  return {
    config: { enabled: true, paused: false, ...config },
    chaseStatus: CHASE_STATUS.AWAITING_SIGNAL,
    fired: false,
  }
}

export function runActors(args: {
  actors: ActorRuntime[]
  nowMs: number
  market: SimulatedMarket
  broker: SimulatedExchange
  book: PortfolioBook
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

function stepChase(
  actor: ActorRuntime,
  ctx: {
    nowMs: number
    market: SimulatedMarket
    broker: SimulatedExchange
    book: PortfolioBook
    settings: RiskSettings
    paperRisk: boolean
    recentOrderCount: number
  },
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
      actor.chaseStatus = CHASE_STATUS.AWAITING_LONG
      maybeEnter(ctx, config, "BUY", high, qty, "SL-M", signals, risk)
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
      actor.chaseStatus = CHASE_STATUS.AWAITING_SHORT
      maybeEnter(ctx, config, "SELL", low, qty, "SL-M", signals, risk)
    }
    return
  }

  if (actor.chaseStatus === CHASE_STATUS.LONG && quote.low <= (config.lowestLow ?? ema)) {
    signals.push(signal(ctx.nowMs, config, "SELL", "SL", "long stop"))
    maybeEnter(
      ctx,
      config,
      "SELL",
      quote.last,
      Math.abs(ctx.book.qty(config.symbol)) || qty,
      "MARKET",
      signals,
      risk,
      "FLATTEN"
    )
    actor.chaseStatus = CHASE_STATUS.AWAITING_SIGNAL
  }
  if (actor.chaseStatus === CHASE_STATUS.SHORT && quote.high >= (config.highestHigh ?? ema)) {
    signals.push(signal(ctx.nowMs, config, "BUY", "SL", "short stop"))
    maybeEnter(
      ctx,
      config,
      "BUY",
      quote.last,
      Math.abs(ctx.book.qty(config.symbol)) || qty,
      "MARKET",
      signals,
      risk,
      "FLATTEN"
    )
    actor.chaseStatus = CHASE_STATUS.AWAITING_SIGNAL
  }
}

function stepTimeEntry(
  actor: ActorRuntime,
  ctx: {
    nowMs: number
    market: SimulatedMarket
    broker: SimulatedExchange
    book: PortfolioBook
    settings: RiskSettings
    paperRisk: boolean
    recentOrderCount: number
  },
  signals: SignalEvent[],
  risk: RiskEvent[]
): void {
  if (actor.fired) return
  const fire = actor.config.fireAt ?? "09:20"
  const [hh, mm] = fire.split(":").map(Number)
  const ist = dayjs(ctx.nowMs).tz(IST_TZ)
  const istMin = ist.hour() * 60 + ist.minute()
  const fireMin = hh * 60 + mm
  if (istMin < fireMin) return

  // Real ATM straddle skips the market-hours check when MOCK_ORDERS is true.
  // Live path (paperRisk=false) must honor isMarketOpen.
  if (!ctx.paperRisk && !isMarketOpen()) return
  if (ctx.paperRisk && !isSessionOpen(ctx.nowMs) && !process.env.MOCK_ORDERS) return

  actor.fired = true
  const qty = actor.config.lots * (actor.config.kind === "strangle" ? 65 : 65)
  signals.push(
    signal(ctx.nowMs, actor.config, "SELL", "ENTRY", `${actor.config.kind} scheduled entry`)
  )
  maybeEnter(
    ctx,
    actor.config,
    "SELL",
    ctx.market.get(actor.config.symbol)?.last ?? 0,
    qty,
    "MARKET",
    signals,
    risk
  )
}

function maybeEnter(
  ctx: {
    nowMs: number
    market: SimulatedMarket
    broker: SimulatedExchange
    book: PortfolioBook
    settings: RiskSettings
    paperRisk: boolean
    recentOrderCount: number
  },
  config: ActorConfig,
  side: Side,
  triggerOrPx: number,
  quantity: number,
  orderType: PlaceOrderInput["orderType"],
  _signals: SignalEvent[],
  risk: RiskEvent[],
  role: "ENTRY" | "FLATTEN" | "SL" | "EXIT" = "ENTRY"
): void {
  if (quantity <= 0) return
  const quote = ctx.market.get(config.symbol)
  const settings: RiskSettings = {
    ...DEFAULT_RISK_SETTINGS,
    ...ctx.settings,
    strategies: ctx.settings.strategies,
  }
  const decision = evaluateOrder(
    {
      role,
      tradingsymbol: config.symbol,
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
      marketOpen: isMarketOpen(),
      jobAborted: false,
      openPositionCount: [...ctx.book.positions.values()].filter(p => p.quantity !== 0).length,
      openOrderCount: [...ctx.broker.orders.values()].filter(
        o => !["FILLED", "CANCELLED", "REJECTED", "EXPIRED", "FAILED"].includes(o.status)
      ).length,
      recentOrderCount: ctx.recentOrderCount,
      pendingDuplicate: false,
      dailyLossInr: [...ctx.book.positions.values()].reduce(
        (s, p) => s + moneyToNumber(p.realizedPnl),
        0
      ),
      drawdownPct: 0,
    }
  )
  if (!decision.ok) {
    risk.push({
      at: ctx.nowMs,
      code: decision.code,
      message: decision.message,
      strategy: config.strategy,
      symbol: config.symbol,
    })
    return
  }
  ctx.broker.placeOrder(
    {
      symbol: config.symbol,
      side,
      quantity,
      orderType,
      triggerPrice:
        orderType === "SL-M" || orderType === "SL" || orderType === "SL-L" ? triggerOrPx : null,
      price: orderType === "SL-L" ? triggerOrPx : null,
      tag: config.kind,
      role,
      strategy: config.strategy,
      clientKey: `${config.kind}:${config.symbol}:${side}:${quantity}:${role}:${ctx.nowMs}`,
    },
    ctx.market,
    ctx.nowMs
  )
  if (config.kind === "chase" && role === "ENTRY") {
    // status advanced by caller
  }
}

function signal(
  at: number,
  config: ActorConfig,
  side: Side,
  kind: string,
  reason: string
): SignalEvent {
  return { at, strategy: config.strategy, symbol: config.symbol, side, kind, reason }
}
