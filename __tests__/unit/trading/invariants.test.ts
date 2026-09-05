import { applyFillToPosition, emptyPosition, unrealizedPnl } from "../../../lib/trading/accounting"
import { mapKiteOrderStatus } from "../../../lib/trading/kiteMap"
import { moneyFromString, moneyToString } from "../../../lib/trading/money"
import { canTransitionOrder } from "../../../lib/trading/stateMachine"

const at = new Date()

function fill(side: "BUY" | "SELL", qty: number, price: string, current = emptyPosition()) {
  return applyFillToPosition(current, {
    side,
    quantity: qty,
    price: moneyFromString(price),
    fee: moneyFromString("0"),
    at,
  })
}

describe("ledger invariants", () => {
  it("filled qty on a Kite complete order maps to FILLED not OPEN", () => {
    expect(mapKiteOrderStatus({ kiteStatus: "COMPLETE", filledQty: 65, requestedQty: 65 })).toBe(
      "FILLED"
    )
    expect(mapKiteOrderStatus({ kiteStatus: "OPEN", filledQty: 20, requestedQty: 65 })).toBe(
      "PARTIALLY_FILLED"
    )
    expect(
      mapKiteOrderStatus({ kiteStatus: "TRIGGER PENDING", filledQty: 0, requestedQty: 65 })
    ).toBe("ACCEPTED")
    expect(mapKiteOrderStatus({ kiteStatus: "REJECTED" })).toBe("REJECTED")
  })

  it("a closed position has zero remaining quantity", () => {
    const closed = fill("SELL", 50, "90", fill("BUY", 50, "80").next)
    expect(closed.next.quantity).toBe(0)
  })

  it("duplicate economic fills would double quantity if applied — callers must key by fingerprint", () => {
    const first = fill("BUY", 50, "100")
    const second = fill("BUY", 50, "100", first.next)
    expect(second.next.quantity).toBe(100)
  })

  it("rejected/failed orders cannot become filled in the state machine", () => {
    expect(canTransitionOrder("REJECTED", "ACCEPTED")).toBe(false)
    expect(canTransitionOrder("FAILED", "FILLED")).toBe(false)
  })

  it("cancelling a filled order is illegal", () => {
    expect(canTransitionOrder("FILLED", "CANCELLED")).toBe(false)
  })

  it("unrealized changes with mark; realized does not after close", () => {
    const open = fill("BUY", 10, "50")
    const u1 = unrealizedPnl(open.next.quantity, open.next.averagePrice, moneyFromString("60"))
    const u2 = unrealizedPnl(open.next.quantity, open.next.averagePrice, moneyFromString("40"))
    expect(moneyToString(u1)).toBe("100.0000")
    expect(moneyToString(u2)).toBe("-100.0000")
    const closed = fill("SELL", 10, "55", open.next)
    expect(closed.next.quantity).toBe(0)
    expect(moneyToString(closed.next.realizedPnl)).toBe("50.0000")
    expect(
      moneyToString(
        unrealizedPnl(closed.next.quantity, closed.next.averagePrice, moneyFromString("999"))
      )
    ).toBe("0.0000")
  })
})
