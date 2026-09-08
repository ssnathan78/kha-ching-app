import { INSTRUMENT_DETAILS, type INSTRUMENTS } from "../constants"
import { orderQuantity } from "../pnl"

export type NotionalCapCheck = {
  qty: number
  notional: number
  maxNotionalInr: number
  overCap: boolean
  overBy: number
}

export function orderNotionalInr(qty: number, price: number): number {
  if (!Number.isFinite(qty) || !Number.isFinite(price) || qty <= 0 || price <= 0) return 0
  return qty * price
}

export function chaseFuturesNotionalInr(input: {
  lots: number
  lotSize: number
  price: number
}): number {
  return orderNotionalInr(orderQuantity(input.lots, input.lotSize), input.price)
}

/** Straddle / strangle: each lot is one CE and one PE. */
export function optionStructureNotionalInr(input: {
  lots: number
  lotSize: number
  premium: number
  legs?: number
}): number {
  const legs = input.legs ?? 2
  return orderNotionalInr(orderQuantity(input.lots, input.lotSize) * legs, input.premium)
}

export function notionalVsCap(notional: number, maxNotionalInr: number, qty = 0): NotionalCapCheck {
  const cap = Number.isFinite(maxNotionalInr) ? maxNotionalInr : 0
  const overBy = Math.max(0, notional - cap)
  return {
    qty,
    notional,
    maxNotionalInr: cap,
    overCap: cap > 0 && notional > cap,
    overBy,
  }
}

export function formatInr(n: number): string {
  if (!Number.isFinite(n)) return "—"
  return n.toLocaleString("en-IN", { maximumFractionDigits: 0 })
}

export function lotSizeForInstrument(instrument: string | null | undefined): number {
  const key = String(instrument || "").toUpperCase() as INSTRUMENTS
  return INSTRUMENT_DETAILS[key]?.lotSize ?? 0
}

export function selectedPlanInstruments(
  instruments: Record<string, boolean> | null | undefined
): INSTRUMENTS[] {
  if (!instruments) return []
  return (Object.keys(instruments) as INSTRUMENTS[]).filter(key => instruments[key])
}
