import {
  computeUpdatedSkewPercent,
  isSkewAcceptable,
  shouldEnterAfterSkewTimeout,
} from "../../../lib/strategies/skewMath"

describe("computeUpdatedSkewPercent", () => {
  it("returns max skew when >50% time remains", () => {
    expect(computeUpdatedSkewPercent(0.6, 10, 20)).toBe(10)
  })

  it("decays toward threshold as time runs out", () => {
    const atHalf = computeUpdatedSkewPercent(0.5, 10, 20)
    const nearEnd = computeUpdatedSkewPercent(0.1, 10, 20)
    expect(atHalf).toBe(10)
    expect(nearEnd).toBeGreaterThan(10)
    expect(nearEnd).toBeLessThanOrEqual(20)
  })

  it("returns max when no threshold configured", () => {
    expect(computeUpdatedSkewPercent(0.1, 15, undefined)).toBe(15)
  })

  it("at zero fractional time equals threshold", () => {
    expect(computeUpdatedSkewPercent(0, 10, 25)).toBe(25)
  })
})

describe("isSkewAcceptable", () => {
  it("accepts at threshold boundary", () => {
    expect(isSkewAcceptable(20, 20)).toBe(true)
  })

  it("rejects above threshold", () => {
    expect(isSkewAcceptable(21, 20)).toBe(false)
  })
})

describe("shouldEnterAfterSkewTimeout", () => {
  it("respects takeTradeIrrespectiveSkew flag", () => {
    expect(shouldEnterAfterSkewTimeout(true)).toBe(true)
    expect(shouldEnterAfterSkewTimeout(false)).toBe(false)
  })
})
