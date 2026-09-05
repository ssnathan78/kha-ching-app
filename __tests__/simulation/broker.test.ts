import { PortfolioBook } from "../../lib/simulation/book"
import { SimulatedExchange } from "../../lib/simulation/broker"
import { SimulatedMarket } from "../../lib/simulation/market"
import { createRng } from "../../lib/simulation/rng"

function harness() {
  const rng = createRng(7)
  const market = new SimulatedMarket({ liquidity: "normal" })
  const broker = new SimulatedExchange({ rng, slippage: { mode: "zero" } })
  const book = new PortfolioBook()
  const now = Date.parse("2026-09-07T04:00:00.000Z") // 09:30 IST
  market.setQuote("NIFTY26SEPFUT", 25000, now)
  return { market, broker, book, now }
}

describe("SimulatedExchange", () => {
  it("fills a market order immediately and books the position", () => {
    const { market, broker, book, now } = harness()
    const order = broker.placeOrder(
      { symbol: "NIFTY26SEPFUT", side: "BUY", quantity: 65, orderType: "MARKET" },
      market,
      now
    )
    expect(order.status).toBe("FILLED")
    expect(order.filledQty).toBe(65)
    for (const fill of order.fills) book.applyFill(fill)
    expect(book.qty("NIFTY26SEPFUT")).toBe(65)
  })

  it("partial-fills then completes across ticks", () => {
    const rng = createRng(1)
    const market = new SimulatedMarket({ liquidity: "very_low" })
    const broker = new SimulatedExchange({ rng })
    const now = Date.parse("2026-09-07T04:00:00.000Z")
    market.setQuote("X", 100, now)
    const order = broker.placeOrder(
      { symbol: "X", side: "BUY", quantity: 100, orderType: "MARKET", clientKey: "partial" },
      market,
      now
    )
    expect(order.filledQty).toBe(15)
    expect(order.status).toBe("PARTIALLY_FILLED")
    market.setQuote("X", 100, now + 60_000)
    broker.step(market, now + 60_000, true)
    expect(order.filledQty).toBe(30)
    market.setQuote("X", 100, now + 120_000)
    broker.step(market, now + 120_000, true)
    market.setQuote("X", 100, now + 180_000)
    broker.step(market, now + 180_000, true)
    market.setQuote("X", 100, now + 240_000)
    broker.step(market, now + 240_000, true)
    market.setQuote("X", 100, now + 300_000)
    broker.step(market, now + 300_000, true)
    market.setQuote("X", 100, now + 360_000)
    broker.step(market, now + 360_000, true)
    expect(order.filledQty).toBe(100)
    expect(order.status).toBe("FILLED")
  })

  it("leaves a remainder unfilled when liquidity dries up", () => {
    const rng = createRng(1)
    const market = new SimulatedMarket({ liquidity: "very_low" })
    const broker = new SimulatedExchange({ rng })
    const now = Date.parse("2026-09-07T04:00:00.000Z")
    market.setQuote("X", 100, now)
    const order = broker.placeOrder(
      { symbol: "X", side: "BUY", quantity: 100, orderType: "MARKET" },
      market,
      now
    )
    expect(order.filledQty).toBe(15)
    const dried = market.setQuote("X", 100, now + 1000)
    dried.availableQty = 0
    broker.step(market, now + 1000, true)
    expect(order.filledQty).toBe(15)
    expect(order.status).toBe("PARTIALLY_FILLED")
  })

  it("does not fill a buy limit above the last price", () => {
    const { market, broker, now } = harness()
    const order = broker.placeOrder(
      { symbol: "NIFTY26SEPFUT", side: "BUY", quantity: 65, orderType: "LIMIT", price: 10000 },
      market,
      now
    )
    expect(order.status).toBe("ACCEPTED")
    expect(order.filledQty).toBe(0)
  })

  it("triggers a sell stop when price gaps through the trigger", () => {
    const { market, broker, now } = harness()
    const order = broker.placeOrder(
      {
        symbol: "NIFTY26SEPFUT",
        side: "SELL",
        quantity: 65,
        orderType: "SL-M",
        triggerPrice: 24900,
      },
      market,
      now
    )
    expect(order.filledQty).toBe(0)
    market.setQuote("NIFTY26SEPFUT", 24800, now + 60_000)
    broker.step(market, now + 60_000, true)
    expect(order.status).toBe("FILLED")
  })

  it("rejects when the reject fault is on", () => {
    const { market, broker, now } = harness()
    broker.faults.rejectAll = true
    const order = broker.placeOrder(
      { symbol: "NIFTY26SEPFUT", side: "BUY", quantity: 65 },
      market,
      now
    )
    expect(order.status).toBe("REJECTED")
    expect(order.filledQty).toBe(0)
  })

  it("is idempotent for the same clientKey", () => {
    const { market, broker, now } = harness()
    const a = broker.placeOrder(
      { symbol: "NIFTY26SEPFUT", side: "BUY", quantity: 65, clientKey: "same" },
      market,
      now
    )
    const b = broker.placeOrder(
      { symbol: "NIFTY26SEPFUT", side: "BUY", quantity: 65, clientKey: "same" },
      market,
      now
    )
    expect(a.orderId).toBe(b.orderId)
    expect(broker.fills.length).toBe(1)
  })

  it("throws on timeout without creating a fill", () => {
    const { market, broker, now } = harness()
    broker.faults.timeout = true
    expect(() =>
      broker.placeOrder({ symbol: "NIFTY26SEPFUT", side: "BUY", quantity: 65 }, market, now)
    ).toThrow(/timeout/i)
    expect(broker.fills.length).toBe(0)
  })
})
