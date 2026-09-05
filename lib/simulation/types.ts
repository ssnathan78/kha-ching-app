import type { CalendarOverrides, MarketSessionState } from "../marketCalendar"
import type { OrderRole, RiskSettings } from "../trading/riskEngine"
import type { OrderStatus, Side } from "../trading/types"

export type PricePathKind =
  | "flat"
  | "uptrend"
  | "downtrend"
  | "sideways"
  | "choppy"
  | "breakout"
  | "reversal"
  | "volatility_spike"
  | "crash"
  | "rally"
  | "gap_up"
  | "gap_down"
  | "flash_crash"
  | "flash_rally"
  | "custom"

export type VolatilityRegime =
  | "very_low"
  | "normal"
  | "high"
  | "extreme"
  | "expansion"
  | "contraction"

export type LiquidityRegime = "high" | "normal" | "low" | "very_low"

export type SlippageMode = "zero" | "fixed" | "percent" | "volatility" | "liquidity" | "seeded"

export type DataDefect =
  | "none"
  | "missing_candle"
  | "duplicate_candle"
  | "out_of_order"
  | "stale"
  | "delayed"
  | "bad_timestamp"
  | "missing_volume"
  | "invalid_ohlc"
  | "impossible_price"
  | "outage"

export type FailureKind =
  | "none"
  | "broker_unavailable"
  | "broker_timeout"
  | "http_500"
  | "rate_limit"
  | "connection_reset"
  | "auth_failure"
  | "delayed_response"
  | "unknown_status"
  | "duplicate_response"
  | "incorrect_response"
  | "lost_accept_response"
  | "network_before_submit"
  | "network_after_submit"
  | "delayed_fill"
  | "database_down"
  | "redis_down"
  | "worker_crash"
  | "app_restart"

export type SimOrderType = "MARKET" | "LIMIT" | "SL" | "SL-M" | "SL-L"

export type Quote = {
  symbol: string
  ts: number
  last: number
  bid: number
  ask: number
  volume: number
  open: number
  high: number
  low: number
  close: number
  availableQty: number
  defect: DataDefect
}

export type InstrumentSpec = {
  symbol: string
  lotSize: number
  startPrice: number
}

export type SlippageSpec = {
  mode: SlippageMode
  points?: number
  percent?: number
}

export type FillEvent = {
  fillId: string
  orderId: string
  symbol: string
  side: Side
  quantity: number
  price: number
  fee: number
  at: number
}

export type SimOrder = {
  orderId: string
  clientKey: string
  symbol: string
  side: Side
  quantity: number
  filledQty: number
  orderType: SimOrderType
  product: string
  price: number | null
  triggerPrice: number | null
  status: OrderStatus
  tag: string | null
  role: OrderRole
  strategy: string | null
  rejectReason?: string
  createdAt: number
  updatedAt: number
  fills: FillEvent[]
  delayTicksRemaining: number
}

export type SignalEvent = {
  at: number
  strategy: string
  symbol: string
  side: Side
  kind: string
  reason: string
}

export type RiskEvent = {
  at: number
  code: string
  message: string
  strategy?: string | null
  symbol?: string
}

export type JournalEvent = {
  at: number
  type: string
  detail: Record<string, unknown>
}

export type ActorKind = "chase" | "straddle" | "strangle" | "manual"

export type ActorConfig = {
  kind: ActorKind
  strategy: string
  symbol: string
  lots: number
  enabled?: boolean
  paused?: boolean
  /** Fire time HH:mm IST for time-based option entries. */
  fireAt?: string
  ema?: number
  bufferPercent?: number
  highestHigh?: number
  lowestLow?: number
}

export type FailureSpec = {
  kind: FailureKind
  at?: string
  until?: string
}

export type OutcomeAssertion =
  | { type: "no_orders_outside_session" }
  | { type: "position_qty"; symbol: string; quantity: number }
  | { type: "no_position" }
  | { type: "max_exposure"; maxAbsQty: number }
  | { type: "no_duplicate_fill_qty" }
  | { type: "risk_code_seen"; code: string }
  | { type: "risk_code_absent"; code: string }
  | { type: "no_orders" }
  | { type: "order_count"; min?: number; max?: number }
  | { type: "filled_qty"; symbol: string; quantity: number }
  | { type: "halted_no_entries" }
  | { type: "closed_market_no_live_entries" }
  | { type: "stale_data_no_order" }
  | { type: "recovered_qty"; symbol: string; quantity: number }

export type SimulateConfig = {
  scenario: string
  start: string
  end: string
  seed: number
  instruments: InstrumentSpec[]
  pricePath?: PricePathKind
  volatility?: VolatilityRegime
  liquidity?: LiquidityRegime
  spreadPoints?: number
  slippage?: SlippageSpec
  feeBps?: number
  stepMinutes?: number
  actors?: ActorConfig[]
  failures?: FailureSpec[]
  calendar?: CalendarOverrides
  forcedSession?: MarketSessionState | null
  sessionSchedule?: Array<{ at: string; state: MarketSessionState | null }>
  defects?: Array<{ at: string; symbol: string; defect: DataDefect }>
  risk?: Partial<RiskSettings>
  /** When false, evaluateOrder uses isMock=false (live hours/risk path) while still never calling Kite. */
  paperRisk?: boolean
  assertions?: OutcomeAssertion[]
  restartAt?: string
  allowOrdersWhenClosed?: boolean
}

export type PositionSnapshot = {
  symbol: string
  quantity: number
  averagePrice: number
  realizedPnl: number
  unrealizedPnl: number
  fees: number
}

export type SimResult = {
  scenario: string
  seed: number
  start: string
  end: string
  marketConditions: {
    pricePath: PricePathKind
    volatility: VolatilityRegime
    liquidity: LiquidityRegime
  }
  signals: SignalEvent[]
  orders: SimOrder[]
  fills: FillEvent[]
  positions: PositionSnapshot[]
  portfolio: {
    netQty: number
    realizedPnl: number
    unrealizedPnl: number
    fees: number
    exposure: number
  }
  riskEvents: RiskEvent[]
  errors: string[]
  warnings: string[]
  journal: JournalEvent[]
  assertionResults: Array<{ assertion: OutcomeAssertion; ok: boolean; message: string }>
  invariantViolations: string[]
  finalState: Record<string, unknown>
  elapsedMs: number
  ticks: number
}
