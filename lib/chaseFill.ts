import { CHASE_STATUS, STATUS_TRIGGER_PENDING } from "./constants"
import {
  type ActiveBookBreakdown,
  activeBookFromSources,
  executionModeSwitchBlocked,
  splitLedgerQty,
} from "./trading/bookSplit"
import { isSyntheticProvenance, ledgerProvenance } from "./trading/types"

export type ChaseFillDecision =
  | "already_filled"
  | "wait_open_order"
  | "place_entry"
  | "signal_only"
  | "other_book_open"
export type ChaseEntryFillResult = "filled" | "placed" | "wait" | "failed" | "signal_only"

export type ChaseBookBreakdown = ActiveBookBreakdown

export function chaseLotsFromConfig(lots: number | null | undefined): number {
  const n = Number(lots)
  if (!Number.isFinite(n) || n < 1) return 0
  return Math.trunc(n)
}

export function splitChaseLedgerQty(
  positions: Array<{
    tradingsymbol?: string | null
    quantity?: number | null
    provenance?: string | null
  }>,
  tradingsymbol?: string | null
): { paperLedgerQty: number; liveLedgerQty: number } {
  return splitLedgerQty(positions, { tradingsymbol })
}

/** Active Chase book: paper/mock ledger vs Kite/live ledger. Never mix the two. */
export function chaseBookFromSources(input: {
  paperBook: boolean
  kiteQty: number
  paperLedgerQty: number
  liveLedgerQty: number
}): ChaseBookBreakdown {
  return activeBookFromSources(input)
}

export function chaseBookNetQty(input: {
  paperBook: boolean
  kiteQty: number
  paperLedgerQty?: number
  liveLedgerQty?: number
}): number {
  return chaseBookFromSources({
    paperBook: input.paperBook,
    kiteQty: input.kiteQty,
    paperLedgerQty: input.paperLedgerQty ?? 0,
    liveLedgerQty: input.liveLedgerQty ?? 0,
  }).netQty
}

/** Flatten/exit size is the open book only. Never fall back to configured lots (that opens a new position). */
export function chaseFlattenQty(netQty: number): number {
  const q = Math.abs(Number(netQty) || 0)
  return q > 0 ? q : 0
}

export function chaseExecutionModeSwitchBlocked(input: {
  processMock: boolean
  fromMode: "PAPER" | "LIVE"
  toMode: "PAPER" | "LIVE"
  paperLedgerQty: number
  liveLedgerQty: number
  kiteQty: number
}): { ok: true } | { ok: false; error: string } {
  return executionModeSwitchBlocked({ ...input, strategy: "Chase" })
}

export function chaseSideHasPosition(side: "LONG" | "SHORT", netQty: number): boolean {
  return side === "LONG" ? netQty > 0 : netQty < 0
}

export function chaseStatusHasPosition(status: string | null | undefined, netQty: number): boolean {
  if (status === CHASE_STATUS.LONG) return netQty > 0
  if (status === CHASE_STATUS.SHORT) return netQty < 0
  return false
}

export function chaseFillAllowsStatusFlip(fill: ChaseEntryFillResult): boolean {
  // "placed" with an empty book is a phantom LONG/SHORT. Flip only after size exists.
  return fill === "filled"
}

/** Open LONG/SHORT with a flat book must not punch configured lots (that opens a new position). */
export function decideChaseInPositionSync(input: {
  netQty: number
  side: "LONG" | "SHORT"
  hasOpenEntryOrder: boolean
}): "hold" | "wait_entry" | "reset_empty" {
  if (chaseSideHasPosition(input.side, input.netQty)) return "hold"
  if (input.hasOpenEntryOrder) return "wait_entry"
  return "reset_empty"
}

export function chasePendingStatusFor(side: "LONG" | "SHORT"): string {
  return side === "LONG" ? CHASE_STATUS.AWAITING_LONG : CHASE_STATUS.AWAITING_SHORT
}

export function chaseFillFromDecision(
  action: ChaseFillDecision
): ChaseEntryFillResult | "place_entry" {
  if (action === "already_filled") return "filled"
  if (action === "wait_open_order") return "wait"
  if (action === "signal_only") return "signal_only"
  if (action === "other_book_open") return "failed"
  return "place_entry"
}

/** Live Kite statuses that mean an entry/SL is still working — do not place another. */
export function isChaseWorkingBrokerStatus(status?: string | null): boolean {
  const s = (status || "").toUpperCase().trim()
  return (
    s === STATUS_TRIGGER_PENDING ||
    s === "OPEN" ||
    s === "OPEN PENDING" ||
    s === "VALIDATION PENDING" ||
    s === "PUT ORDER REQ RECEIVED" ||
    s === "MODIFY PENDING"
  )
}

export function chaseHasWorkingEntryOrder(input: {
  paperBook: boolean
  tradingsymbol: string
  side: "BUY" | "SELL"
  ledgerOrders: Array<{
    tradingsymbol?: string | null
    purpose?: string | null
    side?: string | null
    provenance?: string | null
  }>
  kiteOrders?: Array<{
    tradingsymbol?: string | null
    transaction_type?: string | null
    status?: string | null
  }>
}): boolean {
  const ledgerHit = input.ledgerOrders.some(o => {
    if (o.tradingsymbol !== input.tradingsymbol || o.purpose !== "ENTRY" || o.side !== input.side) {
      return false
    }
    const paperOrder = isSyntheticProvenance(ledgerProvenance(o.provenance))
    return input.paperBook ? paperOrder : !paperOrder
  })
  if (ledgerHit) return true
  if (input.paperBook) return false
  return (input.kiteOrders ?? []).some(
    o =>
      o.tradingsymbol === input.tradingsymbol &&
      o.transaction_type === input.side &&
      isChaseWorkingBrokerStatus(o.status)
  )
}

/**
 * Production minute-tick for LONG/SHORT. Same rule on paper and live:
 * a filled protective SL that leaves qty=0 must not MARKET the configured lots.
 */
export function chaseEmptyInPositionMustNotPunchLots(
  sync: ReturnType<typeof decideChaseInPositionSync>
): boolean {
  return sync === "reset_empty" || sync === "wait_entry"
}
