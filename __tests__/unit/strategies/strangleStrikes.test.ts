import { INSTRUMENT_DETAILS, INSTRUMENTS, STRANGLE_ENTRY_STRATEGIES } from "../../../lib/constants"
import {
  applyInvertedStrikes,
  computeStrikesFromDistance,
  computeStrikesFromPercent,
  entryStrategyRequiresPriceLookup,
} from "../../../lib/strategies/strangleStrikes"

const nifty = INSTRUMENT_DETAILS[INSTRUMENTS.NIFTY]

describe("computeStrikesFromDistance", () => {
  it("offsets by strike steps from ATM", () => {
    const atm = 25000
    const { lowerLegPEStrike, higherLegCEStrike } = computeStrikesFromDistance(
      atm,
      nifty.strikeStepSize,
      2
    )
    expect(lowerLegPEStrike).toBe(25000 - 2 * 50)
    expect(higherLegCEStrike).toBe(25000 + 2 * 50)
  })

  it("boundary: 1 step minimum distance", () => {
    const r = computeStrikesFromDistance(25000, 50, 1)
    expect(r.higherLegCEStrike - r.lowerLegPEStrike).toBe(100)
  })
})

describe("computeStrikesFromPercent", () => {
  it("widens strikes by percent from ATM", () => {
    const atm = 25000
    const { lowerLegPEStrike, higherLegCEStrike } = computeStrikesFromPercent(atm, 50, 2)
    expect(lowerLegPEStrike).toBeLessThan(atm)
    expect(higherLegCEStrike).toBeGreaterThan(atm)
  })

  it("symmetric around ATM for equal percent", () => {
    const atm = 25000
    const { lowerLegPEStrike, higherLegCEStrike } = computeStrikesFromPercent(atm, 50, 5)
    expect(atm - lowerLegPEStrike).toBeCloseTo(higherLegCEStrike - atm, -1)
  })
})

describe("applyInvertedStrikes", () => {
  it("swaps pe/ce strikes when inverted", () => {
    const base = { lowerLegPEStrike: 24000, higherLegCEStrike: 26000 }
    const normal = applyInvertedStrikes(base, false)
    const inverted = applyInvertedStrikes(base, true)
    expect(normal.peStrike).toBe(24000)
    expect(inverted.peStrike).toBe(26000)
  })
})

describe("entryStrategyRequiresPriceLookup", () => {
  it("true only for ENTRY_PRICE", () => {
    expect(entryStrategyRequiresPriceLookup(STRANGLE_ENTRY_STRATEGIES.ENTRY_PRICE)).toBe(true)
    expect(entryStrategyRequiresPriceLookup(STRANGLE_ENTRY_STRATEGIES.DISTANCE_FROM_ATM)).toBe(
      false
    )
  })
})
