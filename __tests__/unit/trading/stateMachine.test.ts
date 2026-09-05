import { canTransitionOrder, isTerminalOrder } from "../../../lib/trading/stateMachine"

describe("order state machine", () => {
  it("allows submit → accept → partial → filled", () => {
    expect(canTransitionOrder("PENDING", "SUBMITTED")).toBe(true)
    expect(canTransitionOrder("SUBMITTED", "ACCEPTED")).toBe(true)
    expect(canTransitionOrder("ACCEPTED", "PARTIALLY_FILLED")).toBe(true)
    expect(canTransitionOrder("PARTIALLY_FILLED", "FILLED")).toBe(true)
  })

  it("forbids filled → cancelled (cannot reverse a fill)", () => {
    expect(canTransitionOrder("FILLED", "CANCELLED")).toBe(false)
    expect(isTerminalOrder("FILLED")).toBe(true)
  })

  it("forbids rejected → filled", () => {
    expect(canTransitionOrder("REJECTED", "FILLED")).toBe(false)
    expect(isTerminalOrder("REJECTED")).toBe(true)
  })

  it("allows UNKNOWN to resolve to FILLED after reconcile", () => {
    expect(canTransitionOrder("UNKNOWN", "FILLED")).toBe(true)
    expect(canTransitionOrder("FAILED", "UNKNOWN")).toBe(true)
  })

  it("allows cancel-requested to still fill", () => {
    expect(canTransitionOrder("CANCEL_REQUESTED", "FILLED")).toBe(true)
    expect(canTransitionOrder("CANCEL_REQUESTED", "CANCELLED")).toBe(true)
  })
})
