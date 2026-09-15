import {
  chaseHourlyHoldSummary,
  chaseSlLimitPrice,
  chaseSlTrailSlack,
  chaseSlTrailSummary,
  chaseStopNeedsAmend,
} from "../../../lib/chaseCopy"

describe("chase SL copy and amend detection", () => {
  it("sets buy limit above trigger and sell limit below", () => {
    expect(chaseSlLimitPrice("BUY", 23612)).toBe(23617)
    expect(chaseSlLimitPrice("SELL", 23612)).toBe(23607)
  })

  it("puts EMA and last close on the hourly HOLD line", () => {
    expect(
      chaseHourlyHoldSummary({ status: "SHORT", ema: 23652, lastClose: 23433 })
    ).toBe("Already SHORT — hourly EMA 23652, last close 23433 stored, no new entry")
  })

  it("aligns Slack and Desk trail wording, with 13:15 not 13:00", () => {
    const slack = chaseSlTrailSlack({
      status: "SHORT",
      stoploss: 23612,
      tradingsymbol: "NIFTY26SEPFUT",
    })
    expect(slack).toBe(
      "Chase is currently SHORT. Update the stoploss to 23612 for symbol:NIFTY26SEPFUT"
    )
    expect(
      chaseSlTrailSummary({
        status: "SHORT",
        stoploss: 23612,
        tradingsymbol: "NIFTY26SEPFUT",
        whenLabel: "13:15 IST trail",
      })
    ).toBe(`13:15 IST trail — ${slack}`)
    expect(
      chaseSlTrailSummary({
        status: "SHORT",
        stoploss: 23661,
        tradingsymbol: "NIFTY26SEPFUT",
        whenLabel: "09:16 IST trail",
      })
    ).toContain("09:16 IST trail")
  })

  it("amends paper and live stops when trigger or limit drifted, not when already trailed", () => {
    expect(
      chaseStopNeedsAmend({ stopPrice: "23846.0000", limitPrice: "23851.0000" }, { stop: 23612, limit: 23617 })
    ).toBe(true)
    expect(
      chaseStopNeedsAmend({ trigger_price: 23612, price: 23617 }, { stop: 23612, limit: 23617 })
    ).toBe(false)
    expect(chaseStopNeedsAmend({ stopPrice: 23612, limitPrice: 23617 }, { stop: 23612, limit: 23617 })).toBe(
      false
    )
  })
})
