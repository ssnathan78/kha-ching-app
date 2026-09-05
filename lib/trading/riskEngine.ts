export type OrderRole = "ENTRY" | "EXIT" | "SL" | "FLATTEN"

export const RISK_STRATEGY_KEYS = ["ATM_STRADDLE", "ATM_STRANGLE", "SUBSCRIBE_CHASE"] as const
export type RiskStrategyKey = (typeof RISK_STRATEGY_KEYS)[number]

export type ExecutionMode = "PAPER" | "LIVE"

export type StrategyRiskLimits = {
  enabled: boolean
  halted: boolean
  haltReason: string | null
  /** PAPER uses live quotes and writes the ledger; it never calls Kite placeOrder. */
  executionMode: ExecutionMode
  maxLots: number
  maxDailyLossInr: number
  maxDrawdownPct: number
  maxOpenPositions: number
}

export const DEFAULT_STRATEGY_LIMITS: StrategyRiskLimits = {
  enabled: true,
  halted: false,
  haltReason: null,
  executionMode: "PAPER",
  maxLots: 20,
  maxDailyLossInr: 50_000,
  maxDrawdownPct: 0.15,
  maxOpenPositions: 12,
}

export function defaultStrategyLimits(): Record<RiskStrategyKey, StrategyRiskLimits> {
  return {
    ATM_STRADDLE: { ...DEFAULT_STRATEGY_LIMITS },
    ATM_STRANGLE: { ...DEFAULT_STRATEGY_LIMITS },
    SUBSCRIBE_CHASE: { ...DEFAULT_STRATEGY_LIMITS },
  }
}

export type RiskSettings = {
  tradingEnabled: boolean
  deskHalted: boolean
  haltReason: string | null
  allowLiveOrders: boolean
  maxQtyPerOrder: number
  maxNotionalInr: number
  maxOpenOrders: number
  maxOrdersPerMinute: number
  stalePriceMaxAgeSec: number
  requireMarketHours: boolean
  minLtp: number
  strategies: Record<RiskStrategyKey, StrategyRiskLimits>
}

export const DEFAULT_RISK_SETTINGS: RiskSettings = {
  tradingEnabled: true,
  deskHalted: false,
  haltReason: null,
  allowLiveOrders: false,
  maxQtyPerOrder: 1800,
  maxNotionalInr: 2_000_000,
  maxOpenOrders: 40,
  maxOrdersPerMinute: 20,
  stalePriceMaxAgeSec: 30,
  requireMarketHours: true,
  minLtp: 0.05,
  strategies: defaultStrategyLimits(),
}

export function limitsFor(settings: RiskSettings, strategy?: string | null): StrategyRiskLimits {
  if (strategy && strategy in settings.strategies) {
    return settings.strategies[strategy as RiskStrategyKey]
  }
  return { ...DEFAULT_STRATEGY_LIMITS }
}

/** Unknown or unset strategies default to PAPER so a new book cannot punch Kite. */
export function isPaperStrategy(settings: RiskSettings, strategy?: string | null): boolean {
  return limitsFor(settings, strategy).executionMode !== "LIVE"
}

export type RiskIntent = {
  role: OrderRole
  tradingsymbol: string
  quantity: number
  side: "BUY" | "SELL"
  product?: string | null
  orderType?: string | null
  tag?: string | null
  price?: number | null
  triggerPrice?: number | null
  ltp?: number | null
  ltpAt?: Date | null
  strategy?: string | null
  lots?: number | null
}

export type RiskContext = {
  settings: RiskSettings
  now: Date
  isMock: boolean
  isPaper: boolean
  marketOpen: boolean
  jobAborted: boolean
  openPositionCount: number
  openOrderCount: number
  recentOrderCount: number
  pendingDuplicate: boolean
  dailyLossInr: number
  drawdownPct: number
}

export type RiskDecision = { ok: true } | { ok: false; code: string; message: string }

export class RiskRejectedError extends Error {
  code: string
  constructor(decision: Extract<RiskDecision, { ok: false }>) {
    super(decision.message)
    this.name = "RiskRejectedError"
    this.code = decision.code
  }
}

function fail(code: string, message: string): RiskDecision {
  return { ok: false, code, message }
}

function isEntry(role: OrderRole) {
  return role === "ENTRY"
}

export function inferOrderRole(args: {
  purpose?: string | null
  orderType?: string | null
  tag?: string | null
}): OrderRole {
  const purpose = (args.purpose || "").toUpperCase()
  if (purpose === "FLATTEN" || purpose === "SQUARE_OFF") return "FLATTEN"
  if (purpose === "SL" || purpose === "EXIT") return purpose === "SL" ? "SL" : "EXIT"
  const type = (args.orderType || "").toUpperCase()
  if (type === "SL" || type === "SL-M" || type === "SL-L") return "SL"
  return "ENTRY"
}

export function evaluateOrder(intent: RiskIntent, ctx: RiskContext): RiskDecision {
  const { settings } = ctx
  const qty = intent.quantity
  const strat = limitsFor(settings, intent.strategy)

  if (!Number.isInteger(qty) || qty <= 0) {
    return fail("INVALID_QTY", "Order quantity must be a positive integer")
  }

  if (!ctx.isMock && !ctx.isPaper && !settings.allowLiveOrders) {
    return fail(
      "LIVE_BLOCKED",
      "Live broker orders are off. Set this strategy to Live on Desk → Risk, enable “Allow live orders”, and run without MOCK_ORDERS."
    )
  }

  if (isEntry(intent.role) && settings.deskHalted) {
    return fail("DESK_HALTED", settings.haltReason || "Desk is halted; new entries are rejected")
  }

  if (isEntry(intent.role) && !settings.tradingEnabled) {
    return fail("TRADING_DISABLED", "Trading is disabled on Desk → Risk")
  }

  if (intent.strategy && !strat.enabled) {
    return fail("STRATEGY_DISABLED", `${intent.strategy} is disabled on Desk → Risk`)
  }

  if (isEntry(intent.role) && strat.halted) {
    return fail("STRATEGY_HALTED", strat.haltReason || `${intent.strategy || "Strategy"} is halted`)
  }

  if (isEntry(intent.role) && ctx.jobAborted) {
    return fail("JOB_ABORTED", "Job is aborted; new entries rejected")
  }

  if (isEntry(intent.role) && settings.requireMarketHours && !ctx.isMock && !ctx.marketOpen) {
    return fail("MARKET_CLOSED", "Market is closed (Desk → Risk can turn this check off)")
  }

  if (intent.ltp != null) {
    if (!Number.isFinite(intent.ltp) || intent.ltp < settings.minLtp) {
      return fail(
        "INVALID_PRICE",
        `Price ${intent.ltp} is below the configured minimum ${settings.minLtp}`
      )
    }
    if (intent.ltpAt && settings.stalePriceMaxAgeSec > 0) {
      const ageSec = (ctx.now.getTime() - intent.ltpAt.getTime()) / 1000
      if (ageSec > settings.stalePriceMaxAgeSec) {
        return fail(
          "STALE_DATA",
          `Price is ${Math.round(ageSec)}s old (limit ${settings.stalePriceMaxAgeSec}s)`
        )
      }
    }
  }

  if (qty > settings.maxQtyPerOrder) {
    return fail("MAX_QTY", `Quantity ${qty} exceeds Desk max qty ${settings.maxQtyPerOrder}`)
  }

  if (intent.lots != null && intent.lots > strat.maxLots) {
    return fail(
      "MAX_LOTS",
      `Lots ${intent.lots} exceed ${intent.strategy || "strategy"} max ${strat.maxLots}`
    )
  }

  const px = intent.price || intent.triggerPrice || intent.ltp
  if (px && px > 0) {
    const notional = qty * px
    if (notional > settings.maxNotionalInr) {
      return fail(
        "MAX_NOTIONAL",
        `Notional ${notional} exceeds Desk max ${settings.maxNotionalInr}`
      )
    }
  }

  if (isEntry(intent.role) && ctx.openPositionCount >= strat.maxOpenPositions) {
    return fail(
      "MAX_POSITIONS",
      `Open positions for ${intent.strategy || "this strategy"} at cap ${strat.maxOpenPositions}`
    )
  }

  if (isEntry(intent.role) && ctx.openOrderCount >= settings.maxOpenOrders) {
    return fail("MAX_OPEN_ORDERS", `Working orders at Desk cap ${settings.maxOpenOrders}`)
  }

  if (isEntry(intent.role) && ctx.recentOrderCount >= settings.maxOrdersPerMinute) {
    return fail("ORDER_RATE", `More than ${settings.maxOrdersPerMinute} orders in the last minute`)
  }

  if (isEntry(intent.role) && ctx.dailyLossInr <= -Math.abs(strat.maxDailyLossInr)) {
    return fail(
      "DAILY_LOSS",
      `Daily loss ${ctx.dailyLossInr} for ${intent.strategy || "strategy"} breached ${strat.maxDailyLossInr}`
    )
  }

  if (isEntry(intent.role) && ctx.drawdownPct >= strat.maxDrawdownPct) {
    return fail(
      "DRAWDOWN",
      `Drawdown ${(ctx.drawdownPct * 100).toFixed(1)}% for ${intent.strategy || "strategy"} breached ${(strat.maxDrawdownPct * 100).toFixed(1)}%`
    )
  }

  if (isEntry(intent.role) && ctx.pendingDuplicate) {
    return fail("DUPLICATE", "An equivalent working order already exists")
  }

  return { ok: true }
}
