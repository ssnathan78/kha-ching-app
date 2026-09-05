import { randomUUID } from "node:crypto"
import { and, desc, eq, inArray, isNull } from "drizzle-orm"

import { db, pool } from "../drizzle"
import logger from "../logger"
import {
  auditEvents,
  fills,
  jobExecutions,
  orderEvents,
  orders,
  positions,
  tradingAccounts,
  tradingDecisions,
} from "../schema"
import {
  applyFillToPosition,
  costBasis,
  emptyPosition,
  incrementalFillFromAverages,
  inferPurpose,
  netRealized,
} from "./accounting"
import { fillFingerprint, mapKiteOrderStatus } from "./kiteMap"
import { moneyFromUnknown, moneyMulQty, moneyToString } from "./money"
import { assertOrderTransition } from "./stateMachine"
import {
  type AuditEventType,
  DEFAULT_ACCOUNT_ID,
  type DecisionAction,
  directionFromQty,
  type ExitReason,
  type OrderPurpose,
  type OrderStatus,
  type Provenance,
  type RiskResult,
  type Side,
} from "./types"

export { DEFAULT_ACCOUNT_ID }

type JobRef = { id: string; strategy: string | null }

export async function ensureDefaultAccount(brokerUserId?: string | null) {
  await db
    .insert(tradingAccounts)
    .values({
      id: DEFAULT_ACCOUNT_ID,
      displayName: "Zerodha Kite",
      brokerUserId: brokerUserId ?? null,
    })
    .onConflictDoNothing()
  if (brokerUserId) {
    await db
      .update(tradingAccounts)
      .set({ brokerUserId, updatedAt: new Date() })
      .where(eq(tradingAccounts.id, DEFAULT_ACCOUNT_ID))
  }
}

export async function lookupJobByTag(tag?: string | null): Promise<JobRef | null> {
  if (!tag) return null
  const rows = await db
    .select({ id: jobExecutions.id, strategy: jobExecutions.strategy })
    .from(jobExecutions)
    .where(eq(jobExecutions.orderTag, tag))
    .orderBy(desc(jobExecutions.createdAt))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  return { id: row.id, strategy: row.strategy ?? null }
}

export async function recordDecision(input: {
  jobId?: string | null
  strategy?: string | null
  instrument?: string | null
  tradingsymbol?: string | null
  exchange?: string | null
  side?: Side | null
  action: DecisionAction
  intent?: string | null
  reason?: string | null
  riskResult?: RiskResult | null
  riskDetail?: string | null
  parameters?: Record<string, unknown>
  features?: Record<string, unknown>
  currentPositionQty?: number | null
  proposedQty?: number | null
  proposedPrice?: string | number | null
  idempotencyKey: string
  occurredAt?: Date
  provenance?: Provenance
}): Promise<string | null> {
  await ensureDefaultAccount()
  try {
    const rows = await db
      .insert(tradingDecisions)
      .values({
        accountId: DEFAULT_ACCOUNT_ID,
        jobId: input.jobId ?? null,
        strategy: input.strategy ?? null,
        instrument: input.instrument ?? null,
        tradingsymbol: input.tradingsymbol ?? null,
        exchange: input.exchange ?? null,
        side: input.side ?? null,
        action: input.action,
        intent: input.intent ?? null,
        reason: input.reason ?? null,
        riskResult: input.riskResult ?? null,
        riskDetail: input.riskDetail ?? null,
        parameters: input.parameters ?? {},
        features: input.features ?? {},
        currentPositionQty: input.currentPositionQty ?? null,
        proposedQty: input.proposedQty ?? null,
        proposedPrice: input.proposedPrice == null ? null : String(input.proposedPrice),
        idempotencyKey: input.idempotencyKey,
        occurredAt: input.occurredAt ?? new Date(),
        provenance: input.provenance ?? "LIVE",
      })
      .onConflictDoNothing()
      .returning({ id: tradingDecisions.id })
    const id = rows[0]?.id ?? (await decisionIdByKey(input.idempotencyKey))
    if (id) {
      const auditType: AuditEventType =
        input.action === "RISK_BLOCK" || input.riskResult === "FAILED"
          ? "RISK_CHECK_FAILED"
          : input.action === "SKIP"
            ? "SIGNAL_REJECTED"
            : input.action === "ENTER" || input.action === "EXIT"
              ? "SIGNAL_GENERATED"
              : "SIGNAL_ACCEPTED"
      await recordAuditEvent({
        eventType: auditType,
        decisionId: id,
        jobId: input.jobId,
        summary: input.reason || input.intent || input.action,
        detail: { action: input.action, risk: input.riskResult },
        idempotencyKey: `decision:${input.idempotencyKey}`,
      })
    }
    return id
  } catch (e) {
    logger.error("[ledger.recordDecision]", e)
    return null
  }
}

async function decisionIdByKey(key: string): Promise<string | null> {
  const rows = await db
    .select({ id: tradingDecisions.id })
    .from(tradingDecisions)
    .where(eq(tradingDecisions.idempotencyKey, key))
    .limit(1)
  return rows[0]?.id ?? null
}

export function orderIntentKey(input: {
  tag?: string | null
  tradingsymbol: string
  side: Side
  quantity: number
  purpose: OrderPurpose
  orderType?: string | null
  stopPrice?: string | number | null
  limitPrice?: string | number | null
  retrySuffix?: string | null
}): string {
  const base = [
    input.tag || "",
    input.tradingsymbol,
    input.side,
    String(input.quantity),
    input.purpose,
    input.orderType || "",
    input.stopPrice == null ? "" : String(input.stopPrice),
    input.limitPrice == null ? "" : String(input.limitPrice),
  ].join(":")
  return input.retrySuffix ? `${base}:${input.retrySuffix}` : `intent:${base}`
}

export async function recordOrderIntent(input: {
  jobId?: string | null
  decisionId?: string | null
  strategy?: string | null
  orderTag?: string | null
  purpose?: OrderPurpose
  side: Side
  orderType?: string | null
  product?: string | null
  exchange?: string | null
  tradingsymbol: string
  instrumentToken?: number | null
  validity?: string | null
  requestedQty: number
  limitPrice?: string | number | null
  stopPrice?: string | number | null
  idempotencyKey?: string
  provenance?: Provenance
  metadata?: Record<string, unknown>
}): Promise<{ id: string; created: boolean } | null> {
  await ensureDefaultAccount()
  const job = input.jobId
    ? { id: input.jobId, strategy: input.strategy ?? null }
    : await lookupJobByTag(input.orderTag)
  const purpose = input.purpose ?? inferPurpose({ orderType: input.orderType })
  const key =
    input.idempotencyKey ??
    orderIntentKey({
      tag: input.orderTag,
      tradingsymbol: input.tradingsymbol,
      side: input.side,
      quantity: input.requestedQty,
      purpose,
      orderType: input.orderType,
      stopPrice: input.stopPrice,
      limitPrice: input.limitPrice,
    })

  try {
    const existing = await db.select().from(orders).where(eq(orders.idempotencyKey, key)).limit(1)
    if (existing[0]) {
      if (
        existing[0].status === "REJECTED" ||
        existing[0].status === "FAILED" ||
        existing[0].status === "CANCELLED"
      ) {
        return recordOrderIntent({ ...input, idempotencyKey: `${key}:r:${randomUUID()}` })
      }
      return { id: existing[0].id, created: false }
    }

    const rows = await db
      .insert(orders)
      .values({
        accountId: DEFAULT_ACCOUNT_ID,
        jobId: job?.id ?? input.jobId ?? null,
        decisionId: input.decisionId ?? null,
        strategy: job?.strategy ?? input.strategy ?? null,
        orderTag: input.orderTag ?? null,
        purpose,
        side: input.side,
        orderType: input.orderType ?? null,
        product: input.product ?? null,
        exchange: input.exchange || "NFO",
        tradingsymbol: input.tradingsymbol,
        instrumentToken: input.instrumentToken ?? null,
        validity: input.validity ?? "DAY",
        timeInForce: input.validity ?? "DAY",
        requestedQty: input.requestedQty,
        filledQty: 0,
        remainingQty: input.requestedQty,
        limitPrice: input.limitPrice == null ? null : String(input.limitPrice),
        stopPrice: input.stopPrice == null ? null : String(input.stopPrice),
        status: "PENDING",
        idempotencyKey: key,
        provenance: input.provenance ?? "LIVE",
        metadata: input.metadata ?? {},
      })
      .onConflictDoNothing()
      .returning({ id: orders.id })

    const id = rows[0]?.id ?? (await orderIdByKey(key))
    if (!id) return null
    if (rows[0]?.id) {
      await appendOrderEvent({
        orderId: id,
        fromStatus: null,
        toStatus: "PENDING",
        eventType: "CREATED",
        message: "order intent",
      })
      await recordAuditEvent({
        eventType: "ORDER_CREATED",
        orderId: id,
        jobId: job?.id,
        decisionId: input.decisionId,
        summary: `${input.side} ${input.requestedQty} ${input.tradingsymbol}`,
        idempotencyKey: `order-created:${id}`,
      })
    }
    return { id, created: Boolean(rows[0]?.id) }
  } catch (e) {
    logger.error("[ledger.recordOrderIntent]", e)
    return null
  }
}

async function orderIdByKey(key: string): Promise<string | null> {
  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.idempotencyKey, key))
    .limit(1)
  return rows[0]?.id ?? null
}

async function appendOrderEvent(input: {
  orderId: string
  fromStatus: OrderStatus | null
  toStatus: OrderStatus
  eventType: string
  brokerStatus?: string | null
  filledQty?: number | null
  remainingQty?: number | null
  message?: string | null
  raw?: Record<string, unknown> | null
  occurredAt?: Date
}) {
  await db.insert(orderEvents).values({
    orderId: input.orderId,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    eventType: input.eventType,
    brokerStatus: input.brokerStatus ?? null,
    filledQty: input.filledQty ?? null,
    remainingQty: input.remainingQty ?? null,
    message: input.message ?? null,
    raw: input.raw ?? null,
    occurredAt: input.occurredAt ?? new Date(),
  })
}

export async function markOrderSubmitted(input: {
  orderId?: string | null
  brokerOrderId?: string | null
  exchangeOrderId?: string | null
  errorInfo?: string | null
  status?: OrderStatus
  provenance?: Provenance
}): Promise<void> {
  if (!input.orderId) return
  const rows = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1)
  const current = rows[0]
  if (!current) return
  const next = input.status ?? (input.brokerOrderId ? "SUBMITTED" : "FAILED")
  if (current.status !== next) {
    try {
      assertOrderTransition(current.status as OrderStatus, next)
    } catch (e) {
      logger.warn("[ledger.markOrderSubmitted] ignore illegal transition", e)
      return
    }
  }
  const now = new Date()
  await db
    .update(orders)
    .set({
      status: next,
      brokerOrderId: input.brokerOrderId || current.brokerOrderId,
      exchangeOrderId: input.exchangeOrderId || current.exchangeOrderId,
      errorInfo: input.errorInfo ?? current.errorInfo,
      provenance: input.provenance ?? current.provenance,
      submittedAt: current.submittedAt ?? now,
      updatedAt: now,
    })
    .where(eq(orders.id, current.id))
  if (current.status !== next) {
    await appendOrderEvent({
      orderId: current.id,
      fromStatus: current.status as OrderStatus,
      toStatus: next,
      eventType: next === "FAILED" ? "FAILED" : "SUBMITTED",
      message: input.errorInfo,
    })
    await recordAuditEvent({
      eventType: next === "FAILED" ? "BROKER_ERROR" : "ORDER_SUBMITTED",
      orderId: current.id,
      jobId: current.jobId,
      summary: input.brokerOrderId || input.errorInfo || next,
      idempotencyKey: `order-sub:${current.id}:${input.brokerOrderId || next}`,
    })
  }
}

export async function applyBrokerOrderSnapshot(
  kiteOrder: {
    order_id?: string
    exchange_order_id?: string | null
    parent_order_id?: string | null
    status?: string
    status_message?: string | null
    tradingsymbol?: string
    exchange?: string
    instrument_token?: number
    transaction_type?: string
    order_type?: string
    product?: string
    validity?: string
    quantity?: number
    pending_quantity?: number
    filled_quantity?: number
    price?: number
    trigger_price?: number
    average_price?: number
    tag?: string
    order_timestamp?: string
    exchange_timestamp?: string
  },
  context?: {
    jobId?: string | null
    decisionId?: string | null
    purpose?: OrderPurpose
    provenance?: Provenance
    exitReason?: ExitReason
    internalOrderId?: string | null
  }
): Promise<{ orderId: string | null; fillIds: string[] }> {
  await ensureDefaultAccount()
  const brokerOrderId = kiteOrder.order_id || null
  const requested = Number(kiteOrder.quantity || 0)
  const filled = Number(kiteOrder.filled_quantity ?? 0)
  const remaining = Number(kiteOrder.pending_quantity ?? Math.max(requested - filled, 0))
  const side = (kiteOrder.transaction_type === "SELL" ? "SELL" : "BUY") as Side
  const nextStatus = mapKiteOrderStatus({
    kiteStatus: kiteOrder.status,
    filledQty: filled,
    requestedQty: requested,
  })

  let row =
    (context?.internalOrderId
      ? (await db.select().from(orders).where(eq(orders.id, context.internalOrderId)).limit(1))[0]
      : undefined) ??
    (brokerOrderId
      ? (await db.select().from(orders).where(eq(orders.brokerOrderId, brokerOrderId)).limit(1))[0]
      : undefined)

  if (!row && kiteOrder.tradingsymbol && requested > 0) {
    const created = await recordOrderIntent({
      jobId: context?.jobId,
      decisionId: context?.decisionId,
      orderTag: kiteOrder.tag,
      purpose: context?.purpose,
      side,
      orderType: kiteOrder.order_type,
      product: kiteOrder.product,
      exchange: kiteOrder.exchange,
      tradingsymbol: kiteOrder.tradingsymbol,
      instrumentToken: kiteOrder.instrument_token,
      validity: kiteOrder.validity,
      requestedQty: requested,
      limitPrice: kiteOrder.price,
      stopPrice: kiteOrder.trigger_price,
      provenance: context?.provenance ?? (brokerOrderId ? "RECONCILED" : "LIVE"),
      idempotencyKey: brokerOrderId ? `broker:${brokerOrderId}` : undefined,
    })
    if (created) {
      row = (await db.select().from(orders).where(eq(orders.id, created.id)).limit(1))[0]
    }
  }

  if (!row) return { orderId: null, fillIds: [] }

  const fromStatus = row.status as OrderStatus
  if (fromStatus !== nextStatus) {
    try {
      assertOrderTransition(fromStatus, nextStatus)
    } catch {
      if (fromStatus === "FILLED") {
        // already booked; still try incremental fills if qty increased (should not)
      } else {
        logger.warn("[ledger.applyBrokerOrderSnapshot] illegal transition", {
          fromStatus,
          nextStatus,
          brokerOrderId,
        })
      }
    }
  }

  const now = new Date()
  const occurred = kiteOrder.exchange_timestamp
    ? new Date(kiteOrder.exchange_timestamp)
    : kiteOrder.order_timestamp
      ? new Date(kiteOrder.order_timestamp)
      : now

  const patch: Record<string, unknown> = {
    brokerOrderId: brokerOrderId || row.brokerOrderId,
    exchangeOrderId: kiteOrder.exchange_order_id || row.exchangeOrderId,
    parentBrokerOrderId: kiteOrder.parent_order_id || row.parentBrokerOrderId,
    brokerStatus: kiteOrder.status || row.brokerStatus,
    rawBroker: kiteOrder as Record<string, unknown>,
    filledQty: Math.max(row.filledQty ?? 0, filled),
    remainingQty: Math.max(0, remaining),
    averageFillPrice:
      kiteOrder.average_price != null ? String(kiteOrder.average_price) : row.averageFillPrice,
    rejectReason:
      nextStatus === "REJECTED" ? kiteOrder.status_message || row.rejectReason : row.rejectReason,
    cancelReason:
      nextStatus === "CANCELLED" ? kiteOrder.status_message || row.cancelReason : row.cancelReason,
    updatedAt: now,
  }
  if (fromStatus !== nextStatus || nextStatus === "PARTIALLY_FILLED") {
    patch.status = fromStatus === "FILLED" ? "FILLED" : nextStatus
  }
  if (
    nextStatus === "SUBMITTED" ||
    nextStatus === "ACCEPTED" ||
    nextStatus === "PARTIALLY_FILLED" ||
    nextStatus === "FILLED"
  ) {
    patch.submittedAt = row.submittedAt ?? occurred
  }
  if (nextStatus === "ACCEPTED" || nextStatus === "PARTIALLY_FILLED" || nextStatus === "FILLED") {
    patch.acceptedAt = row.acceptedAt ?? occurred
  }
  if (nextStatus === "FILLED") patch.filledAt = row.filledAt ?? occurred
  if (nextStatus === "CANCELLED") patch.cancelledAt = row.cancelledAt ?? occurred

  await db.update(orders).set(patch).where(eq(orders.id, row.id))
  if (fromStatus !== (patch.status as string)) {
    await appendOrderEvent({
      orderId: row.id,
      fromStatus,
      toStatus: (patch.status as OrderStatus) || nextStatus,
      eventType: nextStatus,
      brokerStatus: kiteOrder.status,
      filledQty: filled,
      remainingQty: remaining,
      message: kiteOrder.status_message,
      raw: kiteOrder as Record<string, unknown>,
      occurredAt: occurred,
    })
    if (nextStatus === "REJECTED") {
      await recordAuditEvent({
        eventType: "ORDER_REJECTED",
        orderId: row.id,
        jobId: row.jobId,
        summary: kiteOrder.status_message || "rejected",
        idempotencyKey: `rej:${row.id}:${brokerOrderId || ""}`,
      })
    }
    if (nextStatus === "CANCELLED") {
      await recordAuditEvent({
        eventType: "ORDER_CANCELLED",
        orderId: row.id,
        jobId: row.jobId,
        summary: kiteOrder.status_message || "cancelled",
        idempotencyKey: `can:${row.id}:${brokerOrderId || ""}`,
      })
    }
  }

  const fillIds: string[] = []
  if (
    filled > (row.filledQty ?? 0) &&
    (nextStatus === "PARTIALLY_FILLED" || nextStatus === "FILLED" || nextStatus === "CANCELLED")
  ) {
    const incremental = incrementalFillFromAverages({
      previousFilledQty: row.filledQty ?? 0,
      previousAverage: moneyFromUnknown(row.averageFillPrice),
      newFilledQty: filled,
      newAverage: moneyFromUnknown(kiteOrder.average_price),
    })
    if (incremental) {
      const fillId = await insertFill({
        orderId: row.id,
        jobId: row.jobId,
        decisionId: row.decisionId,
        strategy: row.strategy,
        brokerOrderId,
        exchange: row.exchange,
        tradingsymbol: row.tradingsymbol,
        instrumentToken: row.instrumentToken,
        product: row.product,
        side: row.side as Side,
        quantity: incremental.quantity,
        price: moneyToString(incremental.price),
        fingerprint: fillFingerprint({
          brokerOrderId,
          quantity: filled,
          price: String(kiteOrder.average_price ?? moneyToString(incremental.price)),
        }),
        occurredAt: occurred,
        provenance: context?.provenance ?? "LIVE",
        raw: kiteOrder as Record<string, unknown>,
      })
      if (fillId) {
        fillIds.push(fillId)
        await applyFillById(fillId, context?.exitReason)
        await recordAuditEvent({
          eventType: incremental.quantity < requested ? "PARTIAL_FILL" : "FILL_RECEIVED",
          orderId: row.id,
          jobId: row.jobId,
          summary: `fill ${incremental.quantity} ${row.tradingsymbol} @ ${moneyToString(incremental.price)}`,
          idempotencyKey: `fill:${fillId}`,
        })
      }
    }
  }

  return { orderId: row.id, fillIds }
}

async function insertFill(input: {
  orderId: string
  jobId?: string | null
  decisionId?: string | null
  strategy?: string | null
  brokerOrderId?: string | null
  brokerTradeId?: string | null
  exchange: string
  tradingsymbol: string
  instrumentToken?: number | null
  product?: string | null
  side: Side
  quantity: number
  price: string
  feeAmount?: string
  fingerprint: string
  occurredAt: Date
  provenance: Provenance
  raw?: Record<string, unknown> | null
}): Promise<string | null> {
  try {
    const rows = await db
      .insert(fills)
      .values({
        accountId: DEFAULT_ACCOUNT_ID,
        orderId: input.orderId,
        jobId: input.jobId ?? null,
        decisionId: input.decisionId ?? null,
        strategy: input.strategy ?? null,
        brokerOrderId: input.brokerOrderId ?? null,
        brokerTradeId: input.brokerTradeId ?? null,
        exchange: input.exchange,
        tradingsymbol: input.tradingsymbol,
        instrumentToken: input.instrumentToken ?? null,
        product: input.product ?? null,
        side: input.side,
        quantity: input.quantity,
        price: input.price,
        feeAmount: input.feeAmount ?? "0",
        fingerprint: input.fingerprint,
        occurredAt: input.occurredAt,
        brokerTime: input.occurredAt,
        provenance: input.provenance,
        rawBroker: input.raw ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: fills.id })
    if (rows[0]?.id) return rows[0].id
    const existing = await db
      .select({ id: fills.id, appliedAt: fills.appliedAt })
      .from(fills)
      .where(eq(fills.fingerprint, input.fingerprint))
      .limit(1)
    return existing[0]?.id ?? null
  } catch (e) {
    logger.error("[ledger.insertFill]", e)
    return null
  }
}

export async function applyUnappliedFills(): Promise<number> {
  const pending = await db
    .select({ id: fills.id })
    .from(fills)
    .where(isNull(fills.appliedAt))
    .orderBy(fills.occurredAt)
  let n = 0
  for (const row of pending) {
    const ok = await applyFillById(row.id)
    if (ok) n += 1
  }
  return n
}

export async function applyFillById(fillId: string, exitReason?: ExitReason): Promise<boolean> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const fillRes = await client.query(`SELECT * FROM fills WHERE id = $1 FOR UPDATE`, [fillId])
    const fill = fillRes.rows[0]
    if (!fill) {
      await client.query("ROLLBACK")
      return false
    }
    if (fill.applied_at) {
      await client.query("COMMIT")
      return false
    }

    const jobId = fill.job_id
    const posRes = await client.query(
      `SELECT * FROM positions
       WHERE account_id = $1 AND exchange = $2 AND tradingsymbol = $3
         AND product = $4 AND COALESCE(job_id, '') = COALESCE($5, '')
       FOR UPDATE`,
      [fill.account_id, fill.exchange, fill.tradingsymbol, fill.product || "", jobId]
    )
    let pos = posRes.rows[0]
    if (!pos) {
      const inserted = await client.query(
        `INSERT INTO positions (
           account_id, job_id, strategy, exchange, tradingsymbol, instrument_token, product, status, provenance
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'FLAT',$8)
         RETURNING *`,
        [
          fill.account_id,
          jobId,
          fill.strategy,
          fill.exchange,
          fill.tradingsymbol,
          fill.instrument_token,
          fill.product || "",
          fill.provenance || "LIVE",
        ]
      )
      pos = inserted.rows[0]
    }

    const before = {
      quantity: Number(pos.quantity),
      averagePrice: moneyFromUnknown(pos.average_entry_price),
      realizedPnl: moneyFromUnknown(pos.realized_pnl),
      fees: moneyFromUnknown(pos.fees),
      openedAt: pos.opened_at ? new Date(pos.opened_at) : null,
    }
    const result = applyFillToPosition(
      before.quantity === 0 && !pos.opened_at ? emptyPosition() : before,
      {
        side: fill.side,
        quantity: Number(fill.quantity),
        price: moneyFromUnknown(fill.price),
        fee: moneyFromUnknown(fill.fee_amount),
        at: new Date(fill.occurred_at),
      }
    )

    const nextStatus = result.next.quantity === 0 ? "FLAT" : "OPEN"
    await client.query(
      `UPDATE positions SET
         quantity = $2,
         average_entry_price = $3,
         cost_basis = $4,
         realized_pnl = $5,
         fees = $6,
         opened_at = $7,
         closed_at = $8,
         last_fill_at = $9,
         updated_at = now(),
         status = $10,
         strategy = COALESCE(strategy, $11),
         provenance = COALESCE(provenance, $12)
       WHERE id = $1`,
      [
        pos.id,
        result.next.quantity,
        moneyToString(result.next.averagePrice),
        moneyToString(costBasis(result.next.quantity, result.next.averagePrice)),
        moneyToString(result.next.realizedPnl),
        moneyToString(result.next.fees),
        result.next.openedAt,
        nextStatus === "FLAT" ? new Date(fill.occurred_at) : null,
        fill.occurred_at,
        nextStatus,
        fill.strategy,
        fill.provenance || "LIVE",
      ]
    )

    await client.query(
      `INSERT INTO position_events (
         position_id, fill_id, event_kind, quantity_before, quantity_after,
         average_before, average_after, realized_delta, fee_delta, reason, occurred_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        pos.id,
        fill.id,
        result.eventKind,
        before.quantity,
        result.next.quantity,
        moneyToString(before.averagePrice),
        moneyToString(result.next.averagePrice),
        moneyToString(result.realizedDelta),
        fill.fee_amount,
        exitReason ?? null,
        fill.occurred_at,
      ]
    )

    await syncTrade(client, {
      positionId: pos.id,
      accountId: fill.account_id,
      jobId,
      decisionId: fill.decision_id,
      strategy: fill.strategy,
      exchange: fill.exchange,
      tradingsymbol: fill.tradingsymbol,
      product: fill.product || "",
      result,
      fill,
      exitReason,
    })

    await client.query(`UPDATE fills SET applied_at = now() WHERE id = $1`, [fill.id])
    await client.query("COMMIT")

    const auditType =
      result.eventKind === "OPENED"
        ? "POSITION_OPENED"
        : result.eventKind === "INCREASED"
          ? "POSITION_INCREASED"
          : result.eventKind === "REDUCED"
            ? "POSITION_REDUCED"
            : "POSITION_CLOSED"
    await recordAuditEvent({
      eventType: auditType,
      positionId: pos.id,
      orderId: fill.order_id,
      jobId,
      summary: `${result.eventKind} ${fill.tradingsymbol} qty ${result.next.quantity}`,
      idempotencyKey: `pos:${fill.id}:${result.eventKind}`,
    })
    return true
  } catch (e) {
    try {
      await client.query("ROLLBACK")
    } catch {
      // ignore
    }
    logger.error("[ledger.applyFillById]", e)
    return false
  } finally {
    client.release()
  }
}

async function syncTrade(
  client: import("pg").PoolClient,
  args: {
    positionId: string
    accountId: string
    jobId: string | null
    decisionId: string | null
    strategy: string | null
    exchange: string
    tradingsymbol: string
    product: string
    result: ReturnType<typeof applyFillToPosition>
    fill: Record<string, unknown>
    exitReason?: ExitReason
  }
) {
  const { result, fill } = args
  const openRes = await client.query(
    `SELECT * FROM trades WHERE position_id = $1 AND status = 'OPEN' FOR UPDATE`,
    [args.positionId]
  )
  let open = openRes.rows[0]

  if (result.eventKind === "OPENED" || (result.reversed && result.openedQty > 0)) {
    if (open && result.reversed) {
      await closeTradeRow(client, open, result, fill, args.exitReason)
      open = null
    }
    const direction = directionFromQty(result.next.quantity)
    if (direction !== "FLAT") {
      await client.query(
        `INSERT INTO trades (
           account_id, job_id, decision_id, position_id, strategy, exchange, tradingsymbol,
           product, direction, status, entry_qty, average_entry, entry_at, provenance
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'OPEN',$10,$11,$12,$13)`,
        [
          args.accountId,
          args.jobId,
          args.decisionId,
          args.positionId,
          args.strategy,
          args.exchange,
          args.tradingsymbol,
          args.product,
          direction,
          result.openedQty,
          moneyToString(result.next.averagePrice),
          fill.occurred_at,
          fill.provenance || "LIVE",
        ]
      )
    }
    return
  }

  if (!open) {
    if (
      result.eventKind === "INCREASED" ||
      result.eventKind === "REDUCED" ||
      result.eventKind === "CLOSED"
    ) {
      const direction = directionFromQty(result.next.quantity || -result.closedQty)
      if (direction === "FLAT" && result.closedQty > 0) {
        return
      }
      const ins = await client.query(
        `INSERT INTO trades (
           account_id, job_id, decision_id, position_id, strategy, exchange, tradingsymbol,
           product, direction, status, entry_qty, average_entry, entry_at, provenance
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'OPEN',$10,$11,$12,$13)
         RETURNING *`,
        [
          args.accountId,
          args.jobId,
          args.decisionId,
          args.positionId,
          args.strategy,
          args.exchange,
          args.tradingsymbol,
          args.product,
          direction === "FLAT" ? "LONG" : direction,
          result.openedQty || Math.abs(Number(result.next.quantity) + result.closedQty),
          moneyToString(result.next.averagePrice || moneyFromUnknown(fill.price)),
          fill.occurred_at,
          fill.provenance || "LIVE",
        ]
      )
      open = ins.rows[0]
    } else {
      return
    }
  }

  if (result.eventKind === "INCREASED") {
    const entryQty = Number(open.entry_qty) + result.openedQty
    await client.query(
      `UPDATE trades SET entry_qty = $2, average_entry = $3, updated_at = now() WHERE id = $1`,
      [open.id, entryQty, moneyToString(result.next.averagePrice)]
    )
    return
  }

  if (result.eventKind === "REDUCED" || result.eventKind === "CLOSED" || result.reversed) {
    await closeOrReduceTrade(client, open, result, fill, args.exitReason)
  }
}

function tradeExitTotals(
  open: Record<string, unknown>,
  result: ReturnType<typeof applyFillToPosition>,
  fill: Record<string, unknown>
) {
  const prevExitQty = Number(open.exit_qty || 0)
  const exitQty = prevExitQty + result.closedQty
  const newGross = moneyFromUnknown(open.gross_pnl) + result.realizedDelta
  const newFees = moneyFromUnknown(open.fees) + moneyFromUnknown(fill.fee_amount)
  const prevExitValue = moneyMulQty(moneyFromUnknown(open.average_exit), prevExitQty)
  const thisExitValue = moneyMulQty(moneyFromUnknown(fill.price), result.closedQty)
  const avgExit =
    exitQty > 0 ? moneyToString((prevExitValue + thisExitValue) / BigInt(exitQty)) : null
  return { exitQty, newGross, newFees, newNet: netRealized(newGross, newFees), avgExit }
}

async function closeOrReduceTrade(
  client: import("pg").PoolClient,
  open: Record<string, unknown>,
  result: ReturnType<typeof applyFillToPosition>,
  fill: Record<string, unknown>,
  exitReason?: ExitReason
) {
  const totals = tradeExitTotals(open, result, fill)
  if (result.eventKind === "CLOSED" || result.reversed) {
    await closeTradeRow(client, open, result, fill, exitReason, totals)
    return
  }

  await client.query(
    `UPDATE trades SET
       exit_qty = $2, average_exit = $3, gross_pnl = $4, fees = $5, net_pnl = $6, updated_at = now()
     WHERE id = $1`,
    [
      open.id,
      totals.exitQty,
      totals.avgExit,
      moneyToString(totals.newGross),
      moneyToString(totals.newFees),
      moneyToString(totals.newNet),
    ]
  )
}

async function closeTradeRow(
  client: import("pg").PoolClient,
  open: Record<string, unknown>,
  result: ReturnType<typeof applyFillToPosition>,
  fill: Record<string, unknown>,
  exitReason: ExitReason | undefined,
  totals = tradeExitTotals(open, result, fill)
) {
  const entryAt = new Date(String(open.entry_at))
  const exitAt = new Date(String(fill.occurred_at))
  const holding = Math.max(0, exitAt.getTime() - entryAt.getTime())
  const entryQty = Number(open.entry_qty || totals.exitQty)
  const notional = moneyMulQty(moneyFromUnknown(open.average_entry), entryQty)
  const returnPct = notional === 0n ? null : Number((totals.newNet * 10000n) / notional) / 10000

  await client.query(
    `UPDATE trades SET
       status = 'CLOSED',
       exit_qty = $2,
       average_exit = COALESCE($3, average_exit),
       gross_pnl = $4,
       fees = $5,
       net_pnl = $6,
       return_pct = $7,
       holding_period_ms = $8,
       exit_at = $9,
       exit_reason = COALESCE($10, exit_reason, 'UNKNOWN'),
       updated_at = now()
     WHERE id = $1`,
    [
      open.id,
      totals.exitQty,
      totals.avgExit,
      moneyToString(totals.newGross),
      moneyToString(totals.newFees),
      moneyToString(totals.newNet),
      returnPct,
      holding,
      fill.occurred_at,
      exitReason ?? (String(fill.provenance) === "MIGRATED" ? "MIGRATED" : "UNKNOWN"),
    ]
  )
}

export async function recordAuditEvent(input: {
  eventType: AuditEventType
  jobId?: string | null
  orderId?: string | null
  decisionId?: string | null
  positionId?: string | null
  tradeId?: string | null
  severity?: string
  actor?: string
  summary?: string | null
  detail?: Record<string, unknown>
  idempotencyKey?: string | null
}): Promise<void> {
  try {
    await ensureDefaultAccount()
    await db
      .insert(auditEvents)
      .values({
        accountId: DEFAULT_ACCOUNT_ID,
        jobId: input.jobId ?? null,
        orderId: input.orderId ?? null,
        decisionId: input.decisionId ?? null,
        positionId: input.positionId ?? null,
        tradeId: input.tradeId ?? null,
        eventType: input.eventType,
        severity: input.severity ?? "INFO",
        actor: input.actor ?? "SYSTEM",
        summary: input.summary ?? null,
        detail: input.detail ?? {},
        idempotencyKey: input.idempotencyKey ?? null,
      })
      .onConflictDoNothing()
  } catch (e) {
    logger.error("[ledger.recordAuditEvent]", e)
  }
}

export async function markOrderUnknown(orderId: string, message?: string) {
  const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
  const current = rows[0]
  if (!current) return
  if (
    current.status === "FILLED" ||
    current.status === "REJECTED" ||
    current.status === "CANCELLED"
  )
    return
  try {
    assertOrderTransition(current.status as OrderStatus, "UNKNOWN")
  } catch {
    return
  }
  await db
    .update(orders)
    .set({ status: "UNKNOWN", errorInfo: message ?? current.errorInfo, updatedAt: new Date() })
    .where(eq(orders.id, orderId))
  await appendOrderEvent({
    orderId,
    fromStatus: current.status as OrderStatus,
    toStatus: "UNKNOWN",
    eventType: "UNKNOWN",
    message,
  })
}

export async function safeRecordOrderFromKiteProps(
  orderProps: {
    tradingsymbol?: string
    exchange?: string
    transaction_type?: string
    order_type?: string
    product?: string
    quantity?: number
    price?: number
    trigger_price?: number
    tag?: string
    validity?: string
  },
  extras?: { purpose?: OrderPurpose; provenance?: Provenance; decisionId?: string | null }
): Promise<string | null> {
  if (!orderProps.tradingsymbol || !orderProps.quantity || !orderProps.transaction_type) return null
  try {
    const recorded = await recordOrderIntent({
      orderTag: orderProps.tag,
      purpose: extras?.purpose,
      side: orderProps.transaction_type === "SELL" ? "SELL" : "BUY",
      orderType: orderProps.order_type,
      product: orderProps.product,
      exchange: orderProps.exchange,
      tradingsymbol: orderProps.tradingsymbol,
      requestedQty: orderProps.quantity,
      limitPrice: orderProps.price,
      stopPrice: orderProps.trigger_price,
      validity: orderProps.validity,
      provenance: extras?.provenance,
      decisionId: extras?.decisionId,
    })
    return recorded?.id ?? null
  } catch (e) {
    logger.error("[ledger.safeRecordOrderFromKiteProps]", e)
    return null
  }
}

export async function getOpenOrders() {
  return db
    .select()
    .from(orders)
    .where(
      inArray(orders.status, [
        "PENDING",
        "SUBMITTED",
        "ACCEPTED",
        "PARTIALLY_FILLED",
        "CANCEL_REQUESTED",
        "UNKNOWN",
      ])
    )
    .orderBy(desc(orders.createdAt))
}

export async function getOpenPositions() {
  return db
    .select()
    .from(positions)
    .where(eq(positions.status, "OPEN"))
    .orderBy(desc(positions.updatedAt))
}

/** Test/helper: apply a fill without a prior Kite snapshot. */
export async function bookTestFill(input: {
  tradingsymbol: string
  side: Side
  quantity: number
  price: string | number
  jobId?: string | null
  strategy?: string | null
  product?: string
  exchange?: string
  orderTag?: string | null
  purpose?: OrderPurpose
  fingerprint?: string
  exitReason?: ExitReason
  occurredAt?: Date
}): Promise<{ orderId: string; fillId: string; positionQty: number }> {
  const recorded = await recordOrderIntent({
    jobId: input.jobId,
    strategy: input.strategy,
    orderTag: input.orderTag,
    purpose: input.purpose ?? "ENTRY",
    side: input.side,
    product: input.product ?? "MIS",
    exchange: input.exchange ?? "NFO",
    tradingsymbol: input.tradingsymbol,
    requestedQty: input.quantity,
    idempotencyKey: `test:${randomUUID()}`,
    provenance: "LIVE",
  })
  if (!recorded) throw new Error("failed to create test order")
  await markOrderSubmitted({
    orderId: recorded.id,
    brokerOrderId: `test-broker-${recorded.id}`,
    status: "SUBMITTED",
  })
  const fillId = await insertFill({
    orderId: recorded.id,
    jobId: input.jobId ?? null,
    strategy: input.strategy ?? null,
    brokerOrderId: `test-broker-${recorded.id}`,
    exchange: input.exchange ?? "NFO",
    tradingsymbol: input.tradingsymbol,
    product: input.product ?? "MIS",
    side: input.side,
    quantity: input.quantity,
    price: String(input.price),
    fingerprint: input.fingerprint ?? `test-fill:${randomUUID()}`,
    occurredAt: input.occurredAt ?? new Date(),
    provenance: "LIVE",
  })
  if (!fillId) throw new Error("failed to insert test fill")
  await db
    .update(orders)
    .set({
      status: "FILLED",
      filledQty: input.quantity,
      remainingQty: 0,
      averageFillPrice: String(input.price),
      filledAt: input.occurredAt ?? new Date(),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, recorded.id))
  await applyFillById(fillId, input.exitReason)
  const pos = await db
    .select()
    .from(positions)
    .where(
      and(
        eq(positions.tradingsymbol, input.tradingsymbol),
        eq(positions.product, input.product ?? "MIS")
      )
    )
    .limit(1)
  return { orderId: recorded.id, fillId, positionQty: pos[0]?.quantity ?? 0 }
}
