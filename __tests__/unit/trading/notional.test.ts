import {
  chaseFuturesNotionalInr,
  formatInr,
  lotSizeForInstrument,
  notionalVsCap,
  optionStructureNotionalInr,
  orderNotionalInr,
} from "../../../lib/trading/notional"

describe("notional helpers", () => {
  it("sizes Chase futures as lots × lot size × price", () => {
    expect(chaseFuturesNotionalInr({ lots: 2, lotSize: 65, price: 23760 })).toBe(2 * 65 * 23760)
    expect(lotSizeForInstrument("NIFTY")).toBe(65)
  })

  it("sizes a straddle as two legs of lots × lot size × premium", () => {
    expect(optionStructureNotionalInr({ lots: 1, lotSize: 65, premium: 150, legs: 2 })).toBe(
      1 * 65 * 2 * 150
    )
  })

  it("flags notional over the Desk cap", () => {
    const notional = orderNotionalInr(130, 23760)
    const check = notionalVsCap(notional, 2_000_000, 130)
    expect(check.overCap).toBe(true)
    expect(check.overBy).toBe(notional - 2_000_000)
    expect(formatInr(2_000_000)).toMatch(/20,00,000|2,000,000/)
  })
})
