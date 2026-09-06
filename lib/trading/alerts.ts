import { and, desc, eq, gte, inArray, lt, or, type SQL } from "drizzle-orm"

import { JOB_EXECUTION_STATUS } from "../constants"
import { db } from "../drizzle"
import { auditEvents, jobExecutions, orders, reconciliationEvents } from "../schema"
import { type FeedPeriod, isHiddenByClears, periodBounds } from "./feedWindow"
import { recordAuditEvent } from "./ledger"
import { listFeedClears } from "./signals"
import type { AuditEventType } from "./types"

export type AlertSeverity = "ERROR" | "WARN" | "INFO"
export type AlertSource = "SCHEDULE" | "JOB" | "RISK" | "ORDER" | "STRATEGY" | "RECON" | "CHASE"

export type OperatorAlert = {
  id: string
  occurredAt: string
  severity: AlertSeverity
  source: AlertSource
  code: string
  summary: string
  strategy?: string | null
  instrument?: string | null
  jobId?: string | null
  orderId?: string | null
  detail?: Record<string, unknown>
}

const ALERT_EVENT_TYPES = new Set<string>([
  "JOB_REJECTED",
  "JOB_FAILED",
  "JOB_DISCARDED",
  "RISK_CHECK_FAILED",
  "RISK_LIMIT_TRIGGERED",
  "ORDER_REJECTED",
  "BROKER_ERROR",
  "RECONCILIATION_MISMATCH",
])

const EVENT_SOURCE: Record<string, AlertSource> = {
  JOB_REJECTED: "SCHEDULE",
  JOB_FAILED: "JOB",
  JOB_DISCARDED: "JOB",
  RISK_CHECK_FAILED: "RISK",
  RISK_LIMIT_TRIGGERED: "RISK",
  ORDER_REJECTED: "ORDER",
  BROKER_ERROR: "ORDER",
  RECONCILIATION_MISMATCH: "RECON",
}

const CODE_EVENT_TYPE: Record<string, AuditEventType> = {
  MARKET_CLOSED: "JOB_REJECTED",
  SCHEDULE_MARKET_CLOSED: "JOB_REJECTED",
  ENQUEUE_FAILED: "JOB_REJECTED",
  JOB_FAILED: "JOB_FAILED",
  JOB_DISCARDED: "JOB_DISCARDED",
  SQUARE_OFF_DISCARDED: "JOB_DISCARDED",
  EXIT_JOB_FAILED: "JOB_FAILED",
  ASO_ENABLE_FAILED: "JOB_FAILED",
  BROKER_ERROR: "BROKER_ERROR",
  ORDER_FAILED: "ORDER_REJECTED",
  RISK_UNAVAILABLE: "RISK_CHECK_FAILED",
  CHASE_NO_FUT: "JOB_FAILED",
  CHASE_INVALID_CANDLE: "JOB_FAILED",
  CHASE_NO_CANDLES: "JOB_FAILED",
  CHASE_SL_NO_POSITION: "JOB_FAILED",
}

export function liveScheduleRejectReason(input: {
  isMock: boolean
  runNow: boolean
  runAt?: string | Date | null
  marketOpenNow: boolean
  marketOpenAtRunAt: boolean
}): { code: "MARKET_CLOSED" | "SCHEDULE_MARKET_CLOSED"; message: string } | null {
  if (input.isMock) return null
  if (input.runNow && !input.marketOpenNow) {
    return { code: "MARKET_CLOSED", message: "Exchange is offline right now." }
  }
  if (!input.runNow && input.runAt && !input.marketOpenAtRunAt) {
    return {
      code: "SCHEDULE_MARKET_CLOSED",
      message: "Exchange would be offline at the scheduled time.",
    }
  }
  return null
}

export function scheduleRejectCode(message: string): string {
  if (message.includes("offline right now")) return "MARKET_CLOSED"
  if (message.includes("offline at the scheduled")) return "SCHEDULE_MARKET_CLOSED"
  return "ENQUEUE_FAILED"
}

export function isOperatorAlertEvent(eventType: string, severity?: string | null): boolean {
  if (ALERT_EVENT_TYPES.has(eventType)) return true
  return severity === "ERROR" || severity === "WARN"
}

export function alertDedupeKey(alert: Pick<OperatorAlert, "jobId" | "orderId" | "code" | "id">) {
  if (alert.orderId) return `order:${alert.orderId}:${alert.code}`
  if (alert.jobId) return `job:${alert.jobId}:${alert.code}`
  return alert.id
}

export function mergeOperatorAlerts(alerts: OperatorAlert[], limit = 80): OperatorAlert[] {
  const seen = new Set<string>()
  const merged: OperatorAlert[] = []
  const sorted = [...alerts].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  )
  for (const alert of sorted) {
    const key = alertDedupeKey(alert)
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(alert)
    if (merged.length >= limit) break
  }
  return merged
}

export function countAlertSeverities(alerts: OperatorAlert[]) {
  let errorCount = 0
  let warnCount = 0
  for (const alert of alerts) {
    if (alert.severity === "ERROR") errorCount += 1
    else if (alert.severity === "WARN") warnCount += 1
  }
  return { errorCount, warnCount }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function queueMessage(queue: unknown): string | null {
  const q = asRecord(queue)
  if (typeof q.error === "string" && q.error) return q.error
  if (typeof q.failedReason === "string" && q.failedReason) return q.failedReason
  return null
}

export async function recordOperatorAlert(input: {
  code: string
  severity?: AlertSeverity
  source: AlertSource
  summary: string
  detail?: Record<string, unknown>
  jobId?: string | null
  orderId?: string | null
  strategy?: string | null
  instrument?: string | null
  eventType?: AuditEventType
  idempotencyKey?: string | null
}): Promise<void> {
  const eventType = input.eventType ?? CODE_EVENT_TYPE[input.code] ?? "BROKER_ERROR"
  await recordAuditEvent({
    eventType,
    jobId: input.jobId,
    orderId: input.orderId,
    severity: input.severity ?? "ERROR",
    summary: input.summary,
    detail: {
      code: input.code,
      source: input.source,
      strategy: input.strategy ?? null,
      instrument: input.instrument ?? null,
      ...(input.detail ?? {}),
    },
    idempotencyKey: input.idempotencyKey ?? null,
  })
}

function alertFromAudit(row: typeof auditEvents.$inferSelect): OperatorAlert {
  const detail = asRecord(row.detail)
  const eventType = String(row.eventType)
  const severity = row.severity === "ERROR" || row.severity === "WARN" ? row.severity : "WARN"
  return {
    id: `audit:${row.id}`,
    occurredAt: row.occurredAt.toISOString(),
    severity,
    source:
      (typeof detail.source === "string" && detail.source
        ? (detail.source as AlertSource)
        : EVENT_SOURCE[eventType]) ?? "JOB",
    code: typeof detail.code === "string" && detail.code ? detail.code : eventType,
    summary: row.summary || eventType,
    strategy: typeof detail.strategy === "string" ? detail.strategy : null,
    instrument: typeof detail.instrument === "string" ? detail.instrument : null,
    jobId: row.jobId,
    orderId: row.orderId,
    detail,
  }
}

export function alertFromRejectedJob(row: {
  id: string
  createdAt: Date
  status: string | null
  strategy?: string | null
  instrument?: string | null
  queue?: unknown
}): OperatorAlert {
  const message = queueMessage(row.queue) || "Job did not run"
  const failed = row.status === JOB_EXECUTION_STATUS.FAILED
  return {
    id: `job:${row.id}:${row.status}`,
    occurredAt: row.createdAt.toISOString(),
    severity: "ERROR",
    source: failed ? "JOB" : "SCHEDULE",
    code: failed ? "JOB_FAILED" : scheduleRejectCode(message),
    summary: message,
    strategy: row.strategy ?? null,
    instrument: row.instrument ?? null,
    jobId: row.id,
    detail: { status: row.status },
  }
}

export function alertFromFailedOrder(row: {
  id: string
  createdAt: Date
  status: string
  strategy?: string | null
  tradingsymbol?: string | null
  rejectReason?: string | null
  errorInfo?: string | null
}): OperatorAlert {
  return {
    id: `order:${row.id}:${row.status}`,
    occurredAt: row.createdAt.toISOString(),
    severity: "ERROR",
    source: "ORDER",
    code: row.status === "EXPIRED" ? "ORDER_EXPIRED" : "ORDER_FAILED",
    summary: row.rejectReason || row.errorInfo || `Order ${row.status.toLowerCase()}`,
    strategy: row.strategy ?? null,
    instrument: row.tradingsymbol ?? null,
    orderId: row.id,
    detail: { status: row.status },
  }
}

function withPeriod<T>(from: Date | undefined, to: Date | undefined, column: T) {
  const parts: SQL[] = []
  if (from) parts.push(gte(column as never, from))
  if (to) parts.push(lt(column as never, to))
  return parts
}

export async function listOperatorAlerts(
  limit = 80,
  period: FeedPeriod = "all"
): Promise<{
  alerts: OperatorAlert[]
  errorCount: number
  warnCount: number
}> {
  const bounds = periodBounds(period)
  const since =
    bounds.from ?? (period === "all" ? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) : undefined)
  const until = bounds.to
  const [auditRows, jobRows, orderRows, reconRows, clears] = await Promise.all([
    db
      .select()
      .from(auditEvents)
      .where(
        and(
          ...withPeriod(since, until, auditEvents.occurredAt),
          or(
            inArray(auditEvents.severity, ["ERROR", "WARN"]),
            inArray(auditEvents.eventType, [...ALERT_EVENT_TYPES])
          )
        )
      )
      .orderBy(desc(auditEvents.occurredAt))
      .limit(200),
    db
      .select({
        id: jobExecutions.id,
        createdAt: jobExecutions.createdAt,
        status: jobExecutions.status,
        strategy: jobExecutions.strategy,
        instrument: jobExecutions.instrument,
        queue: jobExecutions.queue,
      })
      .from(jobExecutions)
      .where(
        and(
          ...withPeriod(since, until, jobExecutions.createdAt),
          inArray(jobExecutions.status, [JOB_EXECUTION_STATUS.REJECT, JOB_EXECUTION_STATUS.FAILED])
        )
      )
      .orderBy(desc(jobExecutions.createdAt))
      .limit(100),
    db
      .select({
        id: orders.id,
        createdAt: orders.createdAt,
        status: orders.status,
        strategy: orders.strategy,
        tradingsymbol: orders.tradingsymbol,
        rejectReason: orders.rejectReason,
        errorInfo: orders.errorInfo,
      })
      .from(orders)
      .where(
        and(
          ...withPeriod(since, until, orders.createdAt),
          inArray(orders.status, ["REJECTED", "FAILED", "EXPIRED"])
        )
      )
      .orderBy(desc(orders.createdAt))
      .limit(100),
    db
      .select()
      .from(reconciliationEvents)
      .where(
        and(
          ...withPeriod(since, until, reconciliationEvents.occurredAt),
          eq(reconciliationEvents.resolved, false)
        )
      )
      .orderBy(desc(reconciliationEvents.occurredAt))
      .limit(50),
    listFeedClears("alerts"),
  ])

  const combined: OperatorAlert[] = [
    ...auditRows
      .filter(row => isOperatorAlertEvent(row.eventType, row.severity))
      .map(alertFromAudit),
    ...jobRows.map(alertFromRejectedJob),
    ...orderRows.map(alertFromFailedOrder),
    ...reconRows.map(row => ({
      id: `recon:${row.id}`,
      occurredAt: row.occurredAt.toISOString(),
      severity: (row.severity === "ERROR" ? "ERROR" : "WARN") as AlertSeverity,
      source: "RECON" as const,
      code: String(row.kind || "RECON_MISMATCH"),
      summary: row.detail || "Unresolved reconciliation mismatch",
      instrument: row.tradingsymbol,
      detail: { kind: row.kind },
    })),
  ].filter(row => !isHiddenByClears(new Date(row.occurredAt), clears))

  const alerts = mergeOperatorAlerts(combined, limit)
  return { alerts, ...countAlertSeverities(alerts) }
}
