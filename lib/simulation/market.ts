import type { CalendarOverrides, MarketSessionState } from "../marketCalendar"
import { marketSessionState } from "../marketCalendar"
import { roundPx } from "./pricePath"
import type { DataDefect, LiquidityRegime, Quote } from "./types"

export const LIQUIDITY_QTY: Record<LiquidityRegime, number> = {
  high: 5000,
  normal: 800,
  low: 80,
  very_low: 15,
}

export const DEFAULT_SPREAD: Record<LiquidityRegime, number> = {
  high: 0.05,
  normal: 0.25,
  low: 1.5,
  very_low: 4,
}

export class SimulatedMarket {
  quotes = new Map<string, Quote>()
  forcedSession: MarketSessionState | null = null
  calendar: CalendarOverrides
  liquidity: LiquidityRegime
  spreadPoints: number | null
  lastSessionDate = ""

  constructor(args: {
    calendar?: CalendarOverrides
    liquidity?: LiquidityRegime
    spreadPoints?: number
  }) {
    this.calendar = args.calendar ?? {}
    this.liquidity = args.liquidity ?? "normal"
    this.spreadPoints = args.spreadPoints ?? null
  }

  sessionAt(ts: number): MarketSessionState {
    return marketSessionState(ts, this.calendar.extraHolidays, this.calendar, this.forcedSession)
  }

  setForcedSession(state: MarketSessionState | null): void {
    this.forcedSession = state
  }

  setQuote(symbol: string, mid: number, ts: number, defect: DataDefect = "none"): Quote {
    const spread = this.spreadPoints ?? DEFAULT_SPREAD[this.liquidity]
    const half = spread / 2
    let last = roundPx(mid)
    const bid = roundPx(mid - half)
    const ask = roundPx(mid + half)
    let volume = 1000
    let high = last
    let low = last
    const availableQty = LIQUIDITY_QTY[this.liquidity]

    if (defect === "impossible_price") last = last * 50
    if (defect === "invalid_ohlc") {
      high = last * 0.9
      low = last * 1.1
    }
    if (defect === "missing_volume") volume = Number.NaN
    if (defect === "stale") {
      ts -= 5 * 60 * 1000
    }
    if (defect === "bad_timestamp") {
      ts += 24 * 60 * 60 * 1000
    }
    if (defect === "outage" || defect === "missing_candle") {
      const prev = this.quotes.get(symbol)
      const quote: Quote = {
        symbol,
        ts,
        last: prev?.last ?? last,
        bid: prev?.bid ?? bid,
        ask: prev?.ask ?? ask,
        volume: 0,
        open: prev?.open ?? last,
        high: prev?.high ?? last,
        low: prev?.low ?? last,
        close: prev?.close ?? last,
        availableQty: 0,
        defect,
      }
      this.quotes.set(symbol, quote)
      return quote
    }

    const prev = this.quotes.get(symbol)
    const quote: Quote = {
      symbol,
      ts,
      last,
      bid: Math.max(0.05, bid),
      ask: Math.max(0.1, ask),
      volume,
      open: prev?.open ?? last,
      high: Math.max(prev?.high ?? last, high),
      low: Math.min(prev?.low ?? last, low),
      close: last,
      availableQty,
      defect,
    }
    this.quotes.set(symbol, quote)
    return quote
  }

  get(symbol: string): Quote | undefined {
    return this.quotes.get(symbol)
  }

  snapshot(): Quote[] {
    return [...this.quotes.values()]
  }

  crossedDay(ts: number): boolean {
    const day = new Date(ts).toISOString().slice(0, 10)
    if (!this.lastSessionDate) {
      this.lastSessionDate = day
      return false
    }
    if (day !== this.lastSessionDate) {
      this.lastSessionDate = day
      return true
    }
    return false
  }
}

export function quoteIsTradeable(
  quote: Quote | undefined,
  nowMs: number,
  maxAgeSec = 180
): boolean {
  if (!quote) return false
  if (quote.defect === "outage" || quote.defect === "missing_candle") return false
  if (quote.defect === "invalid_ohlc") return false
  if (quote.defect === "impossible_price") return false
  if (!Number.isFinite(quote.last) || quote.last <= 0) return false
  if (quote.high < quote.low) return false
  const ageSec = (nowMs - quote.ts) / 1000
  if (quote.defect === "stale" || ageSec > maxAgeSec) return false
  return true
}
