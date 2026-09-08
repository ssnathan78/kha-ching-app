import { CHASE_STATUS } from "./constants"
import {
  type ActiveBookBreakdown,
  activeBookFromSources,
  executionModeSwitchBlocked,
  splitLedgerQty,
} from "./trading/bookSplit"

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
  return fill === "filled" || fill === "placed"
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
