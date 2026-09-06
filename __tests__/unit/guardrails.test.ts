import { STRATEGIES, STRATEGIES_DETAILS } from "../../lib/constants"
import { rupeePnl, strategyPointsFromFills } from "../../lib/pnl"

describe("guardrails", () => {
  it("does not treat rupee P&L as strategy points", () => {
    const fills = [
      { tradingsymbol: "CE", transaction_type: "SELL", quantity: 65, average_price: 100 },
      { tradingsymbol: "CE", transaction_type: "BUY", quantity: 65, average_price: 90 },
    ]
    expect(strategyPointsFromFills(fills)).toBe(10)
    expect(rupeePnl(fills)).toBe(65 * 10)
    expect(rupeePnl(fills)).not.toBe(strategyPointsFromFills(fills))
  })

  it("keeps Chase engine keys on the strategy form defaults", () => {
    const chase = STRATEGIES_DETAILS[STRATEGIES.CHASE].defaultFormState
    expect(chase.emaPeriod).toBe(40)
    expect(chase.bufferPercent).toBe(0.2)
    expect(chase.entryLimitOffset).toBe(5)
    expect(chase.lots).toBe(1)
  })
})
