import type { OrderStatus } from "./types"

const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  PENDING: [
    "SUBMITTED",
    "ACCEPTED",
    "PARTIALLY_FILLED",
    "FILLED",
    "FAILED",
    "REJECTED",
    "CANCELLED",
    "UNKNOWN",
  ],
  SUBMITTED: [
    "ACCEPTED",
    "PARTIALLY_FILLED",
    "FILLED",
    "REJECTED",
    "CANCELLED",
    "EXPIRED",
    "FAILED",
    "UNKNOWN",
    "CANCEL_REQUESTED",
  ],
  ACCEPTED: [
    "PARTIALLY_FILLED",
    "FILLED",
    "CANCEL_REQUESTED",
    "CANCELLED",
    "EXPIRED",
    "REJECTED",
    "UNKNOWN",
  ],
  PARTIALLY_FILLED: [
    "PARTIALLY_FILLED",
    "FILLED",
    "CANCEL_REQUESTED",
    "CANCELLED",
    "EXPIRED",
    "UNKNOWN",
  ],
  FILLED: [],
  CANCEL_REQUESTED: ["CANCELLED", "FILLED", "PARTIALLY_FILLED", "EXPIRED", "UNKNOWN"],
  CANCELLED: [],
  REJECTED: [],
  EXPIRED: [],
  FAILED: ["UNKNOWN", "SUBMITTED"],
  UNKNOWN: [
    "SUBMITTED",
    "ACCEPTED",
    "PARTIALLY_FILLED",
    "FILLED",
    "CANCELLED",
    "REJECTED",
    "EXPIRED",
    "FAILED",
    "CANCEL_REQUESTED",
  ],
}

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to && (from === "PARTIALLY_FILLED" || from === "UNKNOWN" || from === "ACCEPTED")) {
    return true
  }
  return ALLOWED[from].includes(to)
}

export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (from === to) return
  if (!canTransitionOrder(from, to)) {
    throw new Error(`illegal order transition ${from} → ${to}`)
  }
}

export function isTerminalOrder(status: OrderStatus): boolean {
  return ALLOWED[status].length === 0
}
