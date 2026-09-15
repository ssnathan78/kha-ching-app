/** Operator-facing Chase SL / HOLD copy. Keep Slack and Desk Signals aligned. */

export function chaseSlLimitPrice(transactionType: string, stoploss: number): number {
  return transactionType === "BUY" ? stoploss + 5 : stoploss - 5
}

export function numericLevel(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** True when a working stop's trigger or limit does not match the trail. */
export function chaseStopNeedsAmend(
  current: {
    stopPrice?: unknown
    limitPrice?: unknown
    trigger_price?: unknown
    price?: unknown
  },
  next: { stop: number; limit: number }
): boolean {
  const stop = numericLevel(current.stopPrice ?? current.trigger_price)
  const limit = numericLevel(current.limitPrice ?? current.price)
  if (stop == null || Math.round(stop) !== Math.round(next.stop)) return true
  if (limit == null || Math.round(limit) !== Math.round(next.limit)) return true
  return false
}

export function chaseHourlyHoldSummary(input: {
  status: string
  ema?: number | null
  lastClose?: number | null
}): string {
  const emaBit = input.ema != null && Number.isFinite(Number(input.ema)) ? ` EMA ${input.ema}` : ""
  const closeBit =
    input.lastClose != null && Number.isFinite(Number(input.lastClose))
      ? `, last close ${input.lastClose}`
      : ""
  return `Already ${input.status} — hourly${emaBit}${closeBit} stored, no new entry`
}

export function chaseSlTrailSlack(input: {
  status: string
  stoploss: number
  tradingsymbol: string
}): string {
  return `Chase is currently ${input.status}. Update the stoploss to ${input.stoploss} for symbol:${input.tradingsymbol}`
}

export function chaseSlTrailSummary(input: {
  status: string
  stoploss: number
  tradingsymbol: string
  whenLabel: string
}): string {
  return `${input.whenLabel} — ${chaseSlTrailSlack(input)}`
}
