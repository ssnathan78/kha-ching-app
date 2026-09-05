import {
  CHASE_MASTER_DEFAULTS,
  chaseAllowsNewEntry,
  chaseManagesOpenPosition,
  chaseTolerances,
} from "../../lib/chaseDefaults"

describe("chaseTolerances", () => {
  it("uses 0.2% around EMA as the shipped long/short band", () => {
    const { longTolerance, shortTolerance } = chaseTolerances(10000, 0.2)
    expect(longTolerance).toBeCloseTo(10020, 6)
    expect(shortTolerance).toBeCloseTo(9980, 6)
  })

  it("widens both sides when the buffer increases", () => {
    const tight = chaseTolerances(10000, 0.2)
    const wide = chaseTolerances(10000, 1)
    expect(wide.longTolerance).toBeGreaterThan(tight.longTolerance)
    expect(wide.shortTolerance).toBeLessThan(tight.shortTolerance)
  })
})

describe("CHASE_MASTER_DEFAULTS", () => {
  it("ships the historical Chase engine numbers", () => {
    expect(CHASE_MASTER_DEFAULTS).toEqual({
      lots: 1,
      emaPeriod: 40,
      bufferPercent: 0.2,
      entryLimitOffset: 5,
      paused: false,
      instruments: ["NIFTY"],
    })
  })
})

describe("Chase pause / resume", () => {
  it("blocks new entries while paused", () => {
    expect(chaseAllowsNewEntry(true)).toBe(false)
    expect(chaseAllowsNewEntry(false)).toBe(true)
  })

  it("still manages an open LONG or SHORT while paused", () => {
    expect(chaseManagesOpenPosition(true, "LONG")).toBe(true)
    expect(chaseManagesOpenPosition(true, "SHORT")).toBe(true)
    expect(chaseManagesOpenPosition(true, "AWAITING_SIGNAL")).toBe(false)
    expect(chaseManagesOpenPosition(true, "AWAITING_LONG")).toBe(false)
  })
})
