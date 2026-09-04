import {
  aggregateFillsBySymbol,
  orderQuantity,
  rupeePnl,
  strategyPointsFromFills,
} from "../../lib/pnl"

describe("rupeePnl", () => {
  it("returns 0 for no orders", () => {
    expect(rupeePnl([])).toBe(0)
  })

  it("computes sell minus buy using quantity × price", () => {
    const orders = [
      { transaction_type: "SELL", quantity: 50, average_price: 100 },
      { transaction_type: "BUY", quantity: 50, average_price: 80 },
    ]
    expect(rupeePnl(orders)).toBe(50 * 100 - 50 * 80)
  })

  it("scales with lots (qty)", () => {
    const oneLot = [
      { transaction_type: "SELL", quantity: 25, average_price: 100 },
      { transaction_type: "BUY", quantity: 25, average_price: 90 },
    ]
    const twoLots = [
      { transaction_type: "SELL", quantity: 50, average_price: 100 },
      { transaction_type: "BUY", quantity: 50, average_price: 90 },
    ]
    expect(rupeePnl(twoLots)).toBe(rupeePnl(oneLot) * 2)
  })
})

describe("strategyPointsFromFills", () => {
  it("sums signed prices, not qty × price", () => {
    const orders = [
      { tradingsymbol: "NIFTY25CE", transaction_type: "SELL", quantity: 50, average_price: 100 },
      { tradingsymbol: "NIFTY25CE", transaction_type: "BUY", quantity: 50, average_price: 80 },
    ]
    expect(strategyPointsFromFills(orders)).toBe(20)
    expect(rupeePnl(orders)).toBe(1000)
  })

  it("handles two fills on different symbols (straddle legs)", () => {
    const orders = [
      { tradingsymbol: "CE", transaction_type: "SELL", quantity: 25, average_price: 80 },
      { tradingsymbol: "PE", transaction_type: "SELL", quantity: 25, average_price: 90 },
    ]
    expect(strategyPointsFromFills(orders)).toBe(170)
    expect(aggregateFillsBySymbol(orders)).toHaveLength(2)
  })
})

describe("orderQuantity", () => {
  it("multiplies lots by lot size", () => {
    expect(orderQuantity(2, 75)).toBe(150)
  })
})
