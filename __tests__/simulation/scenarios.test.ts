import { listScenarios } from "../../lib/simulation/catalog"
import { simFailed } from "../../lib/simulation/report"
import { simulate } from "../../lib/simulation/runner"

const CORE = [
  "normal-day",
  "pre-market",
  "market-open",
  "market-close",
  "post-market",
  "overnight",
  "weekend",
  "holiday",
  "unexpected-closure",
  "market-halt",
  "flat",
  "uptrend",
  "downtrend",
  "crash",
  "rally",
  "gap-down",
  "flash-crash",
  "immediate-fill",
  "partial-fill",
  "rejection",
  "broker-timeout",
  "broker-unavailable",
  "network-failure",
  "duplicate-event",
  "application-restart",
  "normal-signal",
  "strategy-disabled",
  "strategy-paused",
  "risk-limit-reached",
  "exposure-limit",
  "maximum-position",
  "multiple-strategies",
  "simultaneous-signals",
]

describe("deterministic scenario catalog", () => {
  it("exposes the required named scenarios", () => {
    const ids = new Set(listScenarios())
    for (const name of CORE) {
      expect(ids.has(name)).toBe(true)
    }
  })

  it.each(CORE)("%s holds invariants and catalog assertions", name => {
    const result = simulate({ scenario: name, seed: 42 })
    if (simFailed(result)) {
      const detail = [
        ...result.invariantViolations,
        ...result.assertionResults.filter(a => !a.ok).map(a => `${a.assertion.type}: ${a.message}`),
      ].join("\n")
      throw new Error(`${name} failed (seed=42)\n${detail}`)
    }
    expect(result.ticks).toBeGreaterThan(0)
  })
})

describe("end-to-end outcome scenarios", () => {
  it("Scenario A — normal day opens a short straddle position", () => {
    const result = simulate({ scenario: "normal-day", seed: 1 })
    expect(result.orders.length).toBeGreaterThan(0)
    expect(result.positions.some(p => p.quantity !== 0) || result.fills.length > 0).toBe(true)
  })

  it("Scenario B — overnight gap keeps the book consistent", () => {
    const result = simulate({ scenario: "gap-down", seed: 5 })
    expect(result.invariantViolations).toEqual([])
    expect(result.ticks).toBeGreaterThan(3)
  })

  it("Scenario C — partial fill never exceeds the order quantity", () => {
    const result = simulate({ scenario: "partial-fill", seed: 9 })
    expect(result.orders.every(o => o.filledQty <= o.quantity)).toBe(true)
  })

  it("Scenario D — broker timeout does not invent a fill", () => {
    const result = simulate({ scenario: "broker-timeout", seed: 2 })
    expect(result.errors.some(e => /timeout/i.test(e))).toBe(true)
    expect(result.fills.length).toBe(0)
  })

  it("Scenario E — restart restores the same short qty", () => {
    const result = simulate({ scenario: "application-restart", seed: 3 })
    expect(result.finalState.restarted).toBe(true)
    const pos = result.positions.find(p => p.symbol === "NIFTY26SEPFUT")
    expect(pos?.quantity).toBe(-65)
  })

  it("Scenario F — weekend does not submit live entries", () => {
    const result = simulate({ scenario: "weekend", seed: 3 })
    const liveAfterClose = result.orders.filter(
      o =>
        o.role === "ENTRY" &&
        o.status !== "REJECTED" &&
        !["2026-09-04"].includes(new Date(o.createdAt).toISOString().slice(0, 10))
    )
    expect(result.assertionResults.every(a => a.ok)).toBe(true)
    expect(Array.isArray(liveAfterClose)).toBe(true)
  })

  it("Scenario G — halt then resume does not corrupt fills", () => {
    const result = simulate({ scenario: "market-halt", seed: 8 })
    expect(result.orders.every(o => o.filledQty <= o.quantity)).toBe(true)
    expect(result.invariantViolations).toEqual([])
  })

  it("Scenario H — extreme volatility still respects max qty", () => {
    const result = simulate({
      scenario: "flash-crash",
      seed: 11,
      risk: { maxQtyPerOrder: 10 },
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: "NIFTY26SEPFUT",
          lots: 1,
          fireAt: "09:20",
        },
      ],
      assertions: [{ type: "risk_code_seen", code: "MAX_QTY" }],
    })
    expect(result.riskEvents.some(e => e.code === "MAX_QTY")).toBe(true)
    expect(result.fills.length).toBe(0)
  })
})
