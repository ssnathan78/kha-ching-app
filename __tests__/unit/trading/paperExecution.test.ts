import {
  isPaperStopOrderType,
  paperStopTriggered,
  shouldFillPaperOrderNow,
} from "../../../lib/trading/paperExecution"

describe("paper stop matching", () => {
  it("fills market and limit immediately, but not an untriggered sell stop", () => {
    expect(
      shouldFillPaperOrderNow({ orderType: "MARKET", side: "SELL", last: 23597, triggerPrice: 23576 })
    ).toBe(true)
    expect(
      shouldFillPaperOrderNow({ orderType: "LIMIT", side: "BUY", last: 100, triggerPrice: 90 })
    ).toBe(true)
    expect(
      shouldFillPaperOrderNow({
        orderType: "SL",
        side: "SELL",
        last: 23597.4,
        triggerPrice: 23576,
      })
    ).toBe(false)
  })

  it("fills a sell stop when last or low tags the trigger", () => {
    expect(
      paperStopTriggered({ side: "SELL", triggerPrice: 23576, last: 23597, low: 23576 })
    ).toBe(true)
    expect(
      shouldFillPaperOrderNow({
        orderType: "SL-M",
        side: "SELL",
        last: 23570,
        triggerPrice: 23576,
      })
    ).toBe(true)
  })

  it("does not fill a buy protective stop while price is below the trigger", () => {
    expect(isPaperStopOrderType("SL")).toBe(true)
    expect(
      shouldFillPaperOrderNow({
        orderType: "SL",
        side: "BUY",
        last: 23564.8,
        high: 23674,
        triggerPrice: 23953,
      })
    ).toBe(false)
    expect(
      paperStopTriggered({ side: "BUY", triggerPrice: 23953, last: 23960, high: 23960 })
    ).toBe(true)
  })
})
