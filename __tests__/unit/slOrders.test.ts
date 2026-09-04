import { convertSlmToSll } from "../../lib/slOrders"
import { round } from "../../lib/tickSize"

const kite = {
  TRANSACTION_TYPE_SELL: "SELL",
  TRANSACTION_TYPE_BUY: "BUY",
  ORDER_TYPE_SL: "SL",
}

describe("round", () => {
  it("rounds to nearest 0.5 by default", () => {
    expect(round(10.2)).toBe(10)
    expect(round(10.3)).toBe(10.5)
  })
})

describe("convertSlmToSll", () => {
  it("sets a buy stop limit above trigger", () => {
    const order = convertSlmToSll(
      {
        transaction_type: "BUY",
        trigger_price: 100,
        tradingsymbol: "NIFTY",
      },
      1,
      kite
    )
    expect(order.order_type).toBe("SL")
    expect(order.price).toBeGreaterThan(order.trigger_price)
  })

  it("sets a sell stop limit below trigger", () => {
    const order = convertSlmToSll(
      {
        transaction_type: "SELL",
        trigger_price: 100,
        tradingsymbol: "NIFTY",
      },
      1,
      kite
    )
    expect(order.price).toBeLessThan(order.trigger_price)
  })
})
