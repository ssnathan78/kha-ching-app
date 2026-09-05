import type { OrderStatus } from "./types"

const KITE_TO_STATUS: Record<string, OrderStatus> = {
  "PUT ORDER REQ RECEIVED": "SUBMITTED",
  "VALIDATION PENDING": "SUBMITTED",
  "OPEN PENDING": "SUBMITTED",
  "MODIFY PENDING": "ACCEPTED",
  "MODIFY VALIDATION PENDING": "ACCEPTED",
  "AMO REQ RECEIVED": "SUBMITTED",
  OPEN: "ACCEPTED",
  "TRIGGER PENDING": "ACCEPTED",
  COMPLETE: "FILLED",
  REJECTED: "REJECTED",
  CANCELLED: "CANCELLED",
  "CANCEL PENDING": "CANCEL_REQUESTED",
  EXPIRED: "EXPIRED",
}

export function mapKiteOrderStatus(args: {
  kiteStatus?: string | null
  filledQty?: number
  requestedQty?: number
}): OrderStatus {
  const raw = (args.kiteStatus || "").toUpperCase().trim()
  let status = KITE_TO_STATUS[raw] ?? "UNKNOWN"
  const filled = args.filledQty ?? 0
  const requested = args.requestedQty ?? 0
  if (status === "ACCEPTED" && filled > 0 && (requested === 0 || filled < requested)) {
    status = "PARTIALLY_FILLED"
  }
  if (status === "ACCEPTED" && requested > 0 && filled >= requested) {
    status = "FILLED"
  }
  return status
}

export function fillFingerprint(args: {
  brokerOrderId?: string | null
  brokerTradeId?: string | null
  quantity: number
  price: string
  kind?: "trade" | "agg" | "migrated"
}): string {
  if (args.brokerTradeId) return `kite-trade:${args.brokerTradeId}`
  if (args.kind === "migrated" && args.brokerOrderId) {
    return `migrated-txn:${args.brokerOrderId}`
  }
  const orderId = args.brokerOrderId || "unknown"
  return `kite-order:${orderId}:agg:${args.quantity}:${args.price}`
}
