import { simulate } from "../../lib/simulation/runner"

describe("long-duration fast-forward", () => {
  it("walks one trading day in seconds of wall time", () => {
    const result = simulate({
      scenario: "normal-day",
      start: "2026-09-07 09:00",
      end: "2026-09-07 16:00",
      stepMinutes: 5,
      seed: 10,
    })
    expect(result.elapsedMs).toBeLessThan(15_000)
    expect(result.ticks).toBeGreaterThan(50)
    expect(result.invariantViolations).toEqual([])
  })

  it("walks a week Friday→Friday without leaking fill qty", () => {
    const result = simulate({
      scenario: "weekend",
      start: "2026-09-04 09:15",
      end: "2026-09-11 16:00",
      stepMinutes: 60,
      seed: 11,
      paperRisk: true,
    })
    expect(result.elapsedMs).toBeLessThan(20_000)
    expect(result.orders.every(o => o.filledQty <= o.quantity)).toBe(true)
    expect(result.invariantViolations).toEqual([])
  })

  it("walks a month of session-scale steps", () => {
    const result = simulate({
      scenario: "sideways",
      start: "2026-09-01 09:00",
      end: "2026-10-01 16:00",
      stepMinutes: 180,
      seed: 12,
    })
    expect(result.ticks).toBeGreaterThan(20)
    expect(result.invariantViolations).toEqual([])
  })

  it("walks a year with half-day steps without P&L/book drift", () => {
    const result = simulate({
      scenario: "sideways",
      start: "2026-01-02 09:00",
      end: "2027-01-02 16:00",
      stepMinutes: 720,
      seed: 13,
    })
    expect(result.elapsedMs).toBeLessThan(30_000)
    expect(result.invariantViolations).toEqual([])
    expect(result.orders.every(o => o.filledQty <= o.quantity)).toBe(true)
  })
})
