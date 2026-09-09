import { STATUS_TRIGGER_PENDING } from "../../../lib/constants"
import { decideChaseEntryAction } from "../../../lib/chaseSignal"
import {
  chaseEmptyInPositionMustNotPunchLots,
  chaseHasWorkingEntryOrder,
  decideChaseInPositionSync,
} from "../../../lib/chaseFill"
import { paperStopTriggered, shouldFillPaperOrderNow } from "../../../lib/trading/paperExecution"

/**
 * 2026-09-09 production: paper filled untriggered SLs, then MARKET-reentered while SHORT+flat.
 * These decisions are shared by paper and live. Live never auto-fills an untriggered Kite SL;
 * the empty-book MARKET punch was the live-dangerous half of the same bug.
 */
describe("2026-09-09 Chase sequence must not recur (paper or live)", () => {
  const NIFTY = "NIFTY26SEPFUT"

  it("does not fill a sell entry stop while LTP is still above the trigger (paper matcher)", () => {
    expect(
      shouldFillPaperOrderNow({
        orderType: "SL",
        side: "SELL",
        last: 23597.4,
        triggerPrice: 23576,
      })
    ).toBe(false)
    expect(
      paperStopTriggered({ side: "SELL", triggerPrice: 23576, last: 23597.4, low: 23590 })
    ).toBe(false)
  })

  it("does not fill a buy protective stop while price is far below the stop (paper matcher)", () => {
    expect(
      shouldFillPaperOrderNow({
        orderType: "SL",
        side: "BUY",
        last: 23564.8,
        high: 23674,
        triggerPrice: 23953,
      })
    ).toBe(false)
  })

  it("live working TRIGGER PENDING counts as an open entry so Chase will not place a second order", () => {
    expect(
      chaseHasWorkingEntryOrder({
        paperBook: false,
        tradingsymbol: NIFTY,
        side: "SELL",
        ledgerOrders: [],
        kiteOrders: [
          { tradingsymbol: NIFTY, transaction_type: "SELL", status: STATUS_TRIGGER_PENDING },
        ],
      })
    ).toBe(true)
    expect(
      decideChaseEntryAction({
        automated: true,
        quantity: 65,
        netQty: 0,
        side: "SHORT",
        hasOpenEntryOrder: true,
      })
    ).toBe("wait_open_order")
  })

  it("paper ledger TRIGGER PENDING is the working entry; live Kite leftovers are ignored on paper", () => {
    expect(
      chaseHasWorkingEntryOrder({
        paperBook: true,
        tradingsymbol: NIFTY,
        side: "SELL",
        ledgerOrders: [
          {
            tradingsymbol: NIFTY,
            purpose: "ENTRY",
            side: "SELL",
            provenance: "PAPER",
          },
        ],
        kiteOrders: [
          { tradingsymbol: NIFTY, transaction_type: "SELL", status: STATUS_TRIGGER_PENDING },
        ],
      })
    ).toBe(true)
    expect(
      chaseHasWorkingEntryOrder({
        paperBook: true,
        tradingsymbol: NIFTY,
        side: "SELL",
        ledgerOrders: [],
        kiteOrders: [
          { tradingsymbol: NIFTY, transaction_type: "SELL", status: STATUS_TRIGGER_PENDING },
        ],
      })
    ).toBe(false)
  })

  it.each(["paper", "live"] as const)(
    "%s: SHORT with a flat book after SL fill must not MARKET configured lots",
    () => {
      const sync = decideChaseInPositionSync({
        netQty: 0,
        side: "SHORT",
        hasOpenEntryOrder: false,
      })
      expect(sync).toBe("reset_empty")
      expect(chaseEmptyInPositionMustNotPunchLots(sync)).toBe(true)
    }
  )

  it("SHORT with size holds on both books; does not reset or re-punch", () => {
    expect(
      decideChaseInPositionSync({ netQty: -65, side: "SHORT", hasOpenEntryOrder: false })
    ).toBe("hold")
  })
})
