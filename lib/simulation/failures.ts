import type { SimulatedExchange } from "./broker"
import type { FailureKind, FailureSpec } from "./types"

export function applyFailure(broker: SimulatedExchange, kind: FailureKind): void {
  broker.resetFaults()
  switch (kind) {
    case "none":
      return
    case "broker_unavailable":
      broker.faults.unavailable = true
      return
    case "broker_timeout":
      broker.faults.timeout = true
      return
    case "http_500":
      broker.faults.http500 = true
      return
    case "rate_limit":
      broker.faults.rateLimit = true
      return
    case "connection_reset":
      broker.faults.connectionReset = true
      return
    case "auth_failure":
      broker.faults.auth = true
      return
    case "delayed_response":
      broker.faults.delayedResponse = true
      return
    case "unknown_status":
      broker.faults.unknownStatus = true
      return
    case "duplicate_response":
      broker.faults.duplicateResponse = true
      return
    case "incorrect_response":
      broker.faults.incorrectResponse = true
      return
    case "lost_accept_response":
      broker.faults.lostAccept = true
      return
    case "delayed_fill":
      broker.faults.delayTicks = 3
      return
    default:
      return
  }
}

export function activeFailure(specs: FailureSpec[] | undefined, nowIso: string): FailureKind {
  if (!specs?.length) return "none"
  let current: FailureKind = "none"
  for (const spec of specs) {
    if (spec.at && nowIso < spec.at) continue
    if (spec.until && nowIso >= spec.until) continue
    current = spec.kind
  }
  return current
}
