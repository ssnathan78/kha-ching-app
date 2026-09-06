export const DEFAULT_ACCOUNT_ID = "default"

export type OrderStatus =
  | "PENDING"
  | "SUBMITTED"
  | "ACCEPTED"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCEL_REQUESTED"
  | "CANCELLED"
  | "REJECTED"
  | "EXPIRED"
  | "FAILED"
  | "UNKNOWN"

export const ORDER_STATUSES: OrderStatus[] = [
  "PENDING",
  "SUBMITTED",
  "ACCEPTED",
  "PARTIALLY_FILLED",
  "FILLED",
  "CANCEL_REQUESTED",
  "CANCELLED",
  "REJECTED",
  "EXPIRED",
  "FAILED",
  "UNKNOWN",
]

export const OPEN_ORDER_STATUSES: OrderStatus[] = [
  "PENDING",
  "SUBMITTED",
  "ACCEPTED",
  "PARTIALLY_FILLED",
  "CANCEL_REQUESTED",
  "UNKNOWN",
]

export const TERMINAL_ORDER_STATUSES: OrderStatus[] = [
  "FILLED",
  "CANCELLED",
  "REJECTED",
  "EXPIRED",
  "FAILED",
]

export type Side = "BUY" | "SELL"
export type PositionDirection = "LONG" | "SHORT" | "FLAT"
export type PositionStatus = "OPEN" | "FLAT"
export type TradeStatus = "OPEN" | "CLOSED"

export type OrderPurpose = "ENTRY" | "EXIT" | "HEDGE" | "SL" | "SQUARE_OFF" | "OTHER"

export type DecisionAction = "ENTER" | "EXIT" | "HOLD" | "SKIP" | "ADJUST_SL" | "RISK_BLOCK"

export type RiskResult = "PASSED" | "FAILED" | "SKIPPED"

export type ExitReason =
  | "STRATEGY"
  | "STOP_LOSS"
  | "TAKE_PROFIT"
  | "TRAILING_STOP"
  | "RISK_LIMIT"
  | "MAX_HOLDING"
  | "MANUAL"
  | "SHUTDOWN"
  | "BROKER"
  | "ROLLBACK"
  | "RECONCILED"
  | "MIGRATED"
  | "UNKNOWN"

export type PositionEventKind =
  | "OPENED"
  | "INCREASED"
  | "REDUCED"
  | "CLOSED"
  | "REVERSED"
  | "MARKED"

export type Provenance = "LIVE" | "MIGRATED" | "RECONCILED" | "MOCK" | "PAPER"

export type TradeBookFilter = "ALL" | "PAPER" | "LIVE"

export function isSyntheticProvenance(provenance: string | null | undefined): boolean {
  return provenance === "PAPER" || provenance === "MOCK"
}

export function provenanceInBook(
  provenance: string | null | undefined,
  book: Exclude<TradeBookFilter, "ALL">
): boolean {
  if (book === "PAPER") return provenance === "PAPER" || provenance === "MOCK"
  return provenance === "LIVE" || provenance === "RECONCILED" || provenance === "MIGRATED"
}

export type FeeType = "BROKERAGE" | "EXCHANGE" | "STT" | "GST" | "STAMP" | "OTHER"

export type ReconKind =
  | "POSITION_MISMATCH"
  | "AVG_PRICE"
  | "MISSING_ORDER"
  | "UNEXPECTED_ORDER"
  | "FILL_MISMATCH"
  | "STALE_PENDING"
  | "UNKNOWN_BROKER_ORDER"

export type AuditEventType =
  | "SIGNAL_GENERATED"
  | "SIGNAL_ACCEPTED"
  | "SIGNAL_REJECTED"
  | "RISK_CHECK_PASSED"
  | "RISK_CHECK_FAILED"
  | "ORDER_CREATED"
  | "ORDER_SUBMITTED"
  | "ORDER_ACCEPTED"
  | "ORDER_REJECTED"
  | "FILL_RECEIVED"
  | "PARTIAL_FILL"
  | "ORDER_CANCELLED"
  | "POSITION_OPENED"
  | "POSITION_INCREASED"
  | "POSITION_REDUCED"
  | "POSITION_CLOSED"
  | "STRATEGY_PAUSED"
  | "STRATEGY_RESUMED"
  | "RISK_LIMIT_TRIGGERED"
  | "KILL_SWITCH"
  | "RECONCILIATION_MISMATCH"
  | "RECONCILIATION_COMPLETED"
  | "BROKER_ERROR"
  | "MANUAL_INTERVENTION"
  | "JOB_REJECTED"
  | "JOB_FAILED"
  | "JOB_DISCARDED"

export function sideSign(side: Side): 1 | -1 {
  return side === "BUY" ? 1 : -1
}

export function directionFromQty(qty: number): PositionDirection {
  if (qty > 0) return "LONG"
  if (qty < 0) return "SHORT"
  return "FLAT"
}
