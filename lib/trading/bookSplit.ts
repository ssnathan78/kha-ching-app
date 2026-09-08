import { isSyntheticProvenance, ledgerProvenance, provenanceInBook } from "./types"

export type BookQtySplit = {
  paperLedgerQty: number
  liveLedgerQty: number
}

export type ActiveBookBreakdown = {
  paperBook: boolean
  paperLedgerQty: number
  liveLedgerQty: number
  kiteQty: number
  netQty: number
  otherBookOpen: boolean
}

export function splitLedgerQty(
  positions: Array<{
    tradingsymbol?: string | null
    quantity?: number | null
    provenance?: string | null
    strategy?: string | null
  }>,
  opts?: { tradingsymbol?: string | null; strategy?: string | null }
): BookQtySplit {
  let paperLedgerQty = 0
  let liveLedgerQty = 0
  for (const pos of positions) {
    if (opts?.tradingsymbol && pos.tradingsymbol !== opts.tradingsymbol) continue
    if (opts?.strategy && pos.strategy !== opts.strategy) continue
    const q = Number(pos.quantity || 0)
    if (q === 0) continue
    if (
      isSyntheticProvenance(ledgerProvenance(pos.provenance as "PAPER" | "MOCK" | "LIVE" | null))
    ) {
      paperLedgerQty += q
    } else {
      liveLedgerQty += q
    }
  }
  return { paperLedgerQty, liveLedgerQty }
}

/** Active book: paper/mock ledger vs Kite/live ledger. Never mix the two. */
export function activeBookFromSources(input: {
  paperBook: boolean
  kiteQty: number
  paperLedgerQty: number
  liveLedgerQty: number
}): ActiveBookBreakdown {
  const kiteQty = Number(input.kiteQty) || 0
  const paperLedgerQty = Number(input.paperLedgerQty) || 0
  const liveLedgerQty = Number(input.liveLedgerQty) || 0
  const netQty = input.paperBook ? paperLedgerQty : kiteQty !== 0 ? kiteQty : liveLedgerQty
  const otherBookOpen = input.paperBook
    ? liveLedgerQty !== 0 || kiteQty !== 0
    : paperLedgerQty !== 0
  return {
    paperBook: input.paperBook,
    paperLedgerQty,
    liveLedgerQty,
    kiteQty,
    netQty,
    otherBookOpen,
  }
}

export function executionModeSwitchBlocked(input: {
  processMock: boolean
  strategy: string
  fromMode: "PAPER" | "LIVE"
  toMode: "PAPER" | "LIVE"
  paperLedgerQty: number
  liveLedgerQty: number
  kiteQty?: number
}): { ok: true } | { ok: false; error: string } {
  if (input.processMock || input.fromMode === input.toMode) return { ok: true }
  const fromPaper = input.fromMode !== "LIVE"
  const book = activeBookFromSources({
    paperBook: fromPaper,
    kiteQty: Number(input.kiteQty) || 0,
    paperLedgerQty: input.paperLedgerQty,
    liveLedgerQty: input.liveLedgerQty,
  })
  if (book.netQty === 0) return { ok: true }
  const label = input.strategy
  return {
    ok: false,
    error: fromPaper
      ? `${label} still has a paper book. Square off the real size, or Clear phantom on Desk → Positions if the ledger is leftover, then switch.`
      : `${label} still has a live book. Square off the real size, or Clear phantom on Desk → Positions if the ledger is leftover, then switch.`,
  }
}

export function ledgerRowsForActiveBook<
  T extends {
    quantity?: number | null
    strategy?: string | null
    provenance?: string | null
  },
>(rows: T[], opts: { paperBook: boolean; strategy?: string | null }): T[] {
  return rows.filter(row => {
    if (!row || Number(row.quantity || 0) === 0) return false
    if (opts.strategy && row.strategy && row.strategy !== opts.strategy) return false
    return provenanceInBook(row.provenance, opts.paperBook ? "PAPER" : "LIVE")
  })
}

/**
 * Live square-off: trust Kite when the broker answered.
 * Falling back to the ledger after a successful empty Kite book would flatten paper leftover
 * (or a phantom live row) and can *open* size. Paper never reads Kite.
 */
export function squareOffQtySource(input: {
  paperBook: boolean
  kiteQueried: boolean
  kiteNetLength: number
}): "paper-ledger" | "kite" | "live-ledger" | "empty" {
  if (input.paperBook) return "paper-ledger"
  if (input.kiteQueried && input.kiteNetLength > 0) return "kite"
  if (input.kiteQueried) return "empty"
  return "live-ledger"
}

export type FlattenRowPlan =
  | { action: "flatten"; qty: number; side: "BUY" | "SELL" }
  | { action: "skip"; reason: string }

/**
 * Manual / kill flatten size is the open book only. Never fall back to configured lots
 * (that would open a new position on a flat book).
 */
export function flattenRowPlan(input: {
  ledgerQty: number
  paperBook: boolean
  kiteQueried: boolean
  kiteQty: number
}): FlattenRowPlan {
  const ledgerQty = Number(input.ledgerQty) || 0
  const kiteQty = Number(input.kiteQty) || 0
  const source = squareOffQtySource({
    paperBook: input.paperBook,
    kiteQueried: input.kiteQueried,
    kiteNetLength: kiteQty !== 0 ? 1 : 0,
  })
  if (source === "empty") {
    return { action: "skip", reason: "broker already flat" }
  }
  const signed = source === "kite" ? kiteQty : ledgerQty
  if (!Number.isFinite(signed) || signed === 0) {
    return { action: "skip", reason: "already flat" }
  }
  return {
    action: "flatten",
    qty: Math.abs(signed),
    side: signed > 0 ? "SELL" : "BUY",
  }
}

export function chaseInstrumentFromTradingsymbol(symbol: string | null | undefined): string | null {
  const s = (symbol || "").toUpperCase()
  if (s.startsWith("BANKNIFTY")) return "BANKNIFTY"
  if (s.startsWith("FINNIFTY")) return "FINNIFTY"
  if (s.startsWith("MIDCPNIFTY")) return "MIDCPNIFTY"
  if (s.startsWith("NIFTY")) return "NIFTY"
  return null
}

export function phantomClearBlocked(input: {
  paperBook: boolean
  processMock: boolean
  workingOrders: number
  kiteAvailable: boolean
  kiteQty: number
}): { ok: true } | { ok: false; error: string } {
  if (input.workingOrders > 0) {
    return {
      ok: false,
      error:
        "This symbol still has a working order. Cancel it on Desk → Orders first. Clear phantom only zeros a leftover position row.",
    }
  }
  if (input.paperBook || input.processMock) return { ok: true }
  if (!input.kiteAvailable) {
    return {
      ok: false,
      error:
        "Kite is unavailable, so this live row cannot be proven phantom. Flatten/Kill if the broker still has size, then retry when Kite is up.",
    }
  }
  if (input.kiteQty !== 0) {
    return {
      ok: false,
      error:
        "Kite still has size in this symbol. Square off first. Clear phantom does not send a broker order.",
    }
  }
  return { ok: true }
}
