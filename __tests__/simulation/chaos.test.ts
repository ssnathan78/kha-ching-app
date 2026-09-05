import { assertSimulationSafe, SimulationIsolationError } from "../../lib/simulation/isolation"
import { simulate } from "../../lib/simulation/runner"

describe("chaos and isolation", () => {
  it("refuses to run unless SIMULATION=true", () => {
    const prev = process.env.SIMULATION
    process.env.SIMULATION = "false"
    try {
      expect(() => assertSimulationSafe("test")).toThrow(SimulationIsolationError)
    } finally {
      process.env.SIMULATION = prev
    }
  })

  it("refuses a live Kite host", () => {
    const prev = process.env.KITE_API_ENDPOINT
    process.env.KITE_API_ENDPOINT = "https://api.kite.trade"
    try {
      expect(() => assertSimulationSafe("test")).toThrow(/live Kite/)
    } finally {
      if (prev == null) delete process.env.KITE_API_ENDPOINT
      else process.env.KITE_API_ENDPOINT = prev
    }
  })

  it("duplicate broker events do not increase position", () => {
    const result = simulate({ scenario: "duplicate-event", seed: 4 })
    const qty = result.positions.reduce((s, p) => s + Math.abs(p.quantity), 0)
    expect(qty).toBeLessThanOrEqual(65)
    expect(result.orders.every(o => o.filledQty <= o.quantity)).toBe(true)
  })

  it("lost-accept / unknown status does not auto-submit a second fill", () => {
    const result = simulate({
      scenario: "reconciliation-mismatch",
      seed: 6,
    })
    expect(result.orders.every(o => o.filledQty <= o.quantity)).toBe(true)
  })

  it("stale candle does not generate a Chase order", () => {
    const result = simulate({
      scenario: "normal-signal",
      seed: 1,
      defects: [{ at: "2026-09-07 09:20", symbol: "NIFTY26SEPFUT", defect: "stale" }],
      assertions: [{ type: "stale_data_no_order" }],
    })
    expect(result.riskEvents.some(e => e.code === "STALE_DATA")).toBe(true)
  })
})
