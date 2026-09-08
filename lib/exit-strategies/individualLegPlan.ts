import { round } from "../tickSize"

export type LegFill = {
  tradingsymbol: string
  transaction_type: "BUY" | "SELL"
  average_price: number
  quantity: number
}

export type PlannedLegStop = {
  tradingsymbol: string
  transaction_type: "BUY" | "SELL"
  trigger_price: number
  quantity: number
}

/**
 * 9:20 short straddle / strangle: each filled leg gets its own stop.
 * Hitting CE does not cancel or flatten PE (and the reverse). The leftover
 * wing stays until auto square-off.
 */
export function planIndividualLegStops(fills: LegFill[], slmPercent: number): PlannedLegStop[] {
  return fills.map(fill => {
    const sl = (slmPercent / 100) * fill.average_price
    const short = fill.transaction_type === "SELL"
    return {
      tradingsymbol: fill.tradingsymbol,
      transaction_type: short ? "BUY" : "SELL",
      trigger_price: round(short ? fill.average_price + sl : fill.average_price - sl),
      quantity: Math.abs(fill.quantity),
    }
  })
}

export function remainingStopsAfterLegExit(stops: PlannedLegStop[], closedSymbol: string) {
  return stops.filter(stop => stop.tradingsymbol !== closedSymbol)
}
