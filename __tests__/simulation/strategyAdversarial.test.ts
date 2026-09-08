import { simulate } from "../../lib/simulation/runner"

const NIFTY = "NIFTY26SEPFUT"
const BANK = "BANKNIFTY26SEPFUT"

function qty(
  result: ReturnType<typeof simulate>,
  book: "paperQty" | "liveQty",
  symbol: string
): number {
  return ((result.finalState[book] as Record<string, number> | undefined) ?? {})[symbol] ?? 0
}

const OPTION_REJECT_EMPTY = [
  "straddle-risk-reject-no-fill",
  "strangle-risk-reject-no-fill",
  "straddle-max-lots-reject",
  "strangle-max-lots-reject",
  "straddle-max-positions-no-entry",
  "strangle-max-positions-no-entry",
  "straddle-live-blocked",
  "strangle-live-blocked",
  "straddle-halted-no-entry",
  "strangle-halted-no-entry",
  "risk-limit-reached",
  "maximum-position",
  "strategy-disabled",
] as const

const PAPER_TO_LIVE = [
  { name: "chase-paper-to-live-open", code: "CHASE_OTHER_BOOK", symbol: NIFTY, lot: 65 },
  { name: "straddle-paper-to-live-open", code: "OTHER_BOOK", symbol: NIFTY, lot: 65 },
  { name: "strangle-paper-to-live-open", code: "OTHER_BOOK", symbol: BANK, lot: 30 },
] as const

const LIVE_TO_PAPER = [
  { name: "chase-live-to-paper-open", code: "CHASE_OTHER_BOOK", symbol: NIFTY },
  { name: "straddle-live-to-paper-open", code: "OTHER_BOOK", symbol: NIFTY },
  { name: "strangle-live-to-paper-open", code: "OTHER_BOOK", symbol: BANK },
] as const

describe("all-strategy adversarial sequences", () => {
  it.each(OPTION_REJECT_EMPTY)("%s leaves an empty book", name => {
    const result = simulate({ scenario: name, seed: 1 })
    expect(result.invariantViolations).toEqual([])
    expect(result.assertionResults.every(a => a.ok)).toBe(true)
    expect(result.positions.every(p => p.quantity === 0)).toBe(true)
    expect(result.orders.filter(o => o.role === "FLATTEN" || o.role === "SL").length).toBe(0)
  })

  it.each(PAPER_TO_LIVE)(
    "$name does not punch live while the paper book is open",
    ({ name, code, symbol, lot }) => {
      const result = simulate({ scenario: name, seed: 1 })
      expect(result.invariantViolations).toEqual([])
      expect(result.assertionResults.every(a => a.ok)).toBe(true)
      expect(result.riskEvents.some(e => e.code === code)).toBe(true)
      expect(qty(result, "liveQty", symbol)).toBe(0)
      expect(Math.abs(qty(result, "paperQty", symbol))).toBe(lot)
      expect(result.orders.filter(o => o.provenance === "LIVE" && o.role === "ENTRY").length).toBe(0)
    }
  )

  it.each(LIVE_TO_PAPER)(
    "$name does not open a paper book on top of live",
    ({ name, code, symbol }) => {
      const result = simulate({ scenario: name, seed: 1 })
      expect(result.invariantViolations).toEqual([])
      expect(result.assertionResults.every(a => a.ok)).toBe(true)
      expect(result.riskEvents.some(e => e.code === code)).toBe(true)
      expect(qty(result, "paperQty", symbol)).toBe(0)
      expect(qty(result, "liveQty", symbol)).not.toBe(0)
      expect(result.orders.filter(o => o.provenance === "PAPER" && o.role === "ENTRY").length).toBe(0)
    }
  )
})
