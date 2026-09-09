import { simulate } from "../../lib/simulation/runner"

const NIFTY = "NIFTY26SEPFUT"

function chaseStatus(result: ReturnType<typeof simulate>): string | undefined {
  const actors = result.finalState.actorStatus as Array<{ strategy: string; chaseStatus: string }>
  return actors.find(a => a.strategy === "CHASE")?.chaseStatus
}

function qty(
  result: ReturnType<typeof simulate>,
  book: "paperQty" | "liveQty"
): number {
  return ((result.finalState[book] as Record<string, number> | undefined) ?? {})[NIFTY] ?? 0
}

const REJECT_NO_PHANTOM = [
  "chase-risk-reject-no-phantom",
  "chase-phantom-flatten-no-lots",
  "chase-live-phantom-flatten-no-lots",
  "chase-max-lots-reject-no-phantom",
  "chase-max-positions-no-entry",
  "chase-live-blocked",
  "chase-halted-no-entry",
  "strategy-paused",
] as const

describe("Chase adversarial sequences", () => {
  it.each(REJECT_NO_PHANTOM)(
    "%s leaves Chase AWAITING_SIGNAL with an empty book",
    name => {
      const result = simulate({ scenario: name, seed: 1 })
      expect(result.invariantViolations).toEqual([])
      expect(result.assertionResults.every(a => a.ok)).toBe(true)
      expect(result.positions.every(p => p.quantity === 0)).toBe(true)
      expect(qty(result, "paperQty")).toBe(0)
      expect(qty(result, "liveQty")).toBe(0)
      expect(chaseStatus(result)).toBe("AWAITING_SIGNAL")
      expect(result.orders.filter(o => o.role === "FLATTEN" || o.role === "SL").length).toBe(0)
    }
  )

  it("MAX_NOTIONAL reject does not leave Chase LONG/SHORT", () => {
    const result = simulate({ scenario: "chase-risk-reject-no-phantom", seed: 1 })
    expect(result.riskEvents.some(e => e.code === "MAX_NOTIONAL")).toBe(true)
  })

  it("paper → live with an open paper Chase book does not punch a live flatten or a second entry", () => {
    const result = simulate({ scenario: "chase-paper-to-live-open", seed: 1 })
    expect(result.invariantViolations).toEqual([])
    expect(result.assertionResults.every(a => a.ok)).toBe(true)
    expect(result.riskEvents.some(e => e.code === "CHASE_OTHER_BOOK")).toBe(true)
    expect(qty(result, "liveQty")).toBe(0)
    expect(qty(result, "paperQty")).not.toBe(0)
    expect(result.orders.filter(o => o.provenance === "LIVE" && o.role === "ENTRY").length).toBe(0)
    expect(chaseStatus(result)).toBe("AWAITING_SIGNAL")
  })

  it("live → paper with an open live Chase book does not open a paper book on top", () => {
    const result = simulate({ scenario: "chase-live-to-paper-open", seed: 1 })
    expect(result.invariantViolations).toEqual([])
    expect(result.assertionResults.every(a => a.ok)).toBe(true)
    expect(result.riskEvents.some(e => e.code === "CHASE_OTHER_BOOK")).toBe(true)
    expect(qty(result, "paperQty")).toBe(0)
    expect(qty(result, "liveQty")).not.toBe(0)
    expect(result.orders.filter(o => o.provenance === "PAPER" && o.role === "ENTRY").length).toBe(0)
  })
})
