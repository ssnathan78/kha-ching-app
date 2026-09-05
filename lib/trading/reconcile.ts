import { db } from "../drizzle"
import { orders, positions, reconciliationEvents } from "../schema"
import { isMockOrder } from "../utils"
import {
  applyBrokerOrderSnapshot,
  applyUnappliedFills,
  getOpenOrders,
  recordAuditEvent,
} from "./ledger"
import { backfillFromTransactions } from "./migrateHistory"
import { moneyFromUnknown, moneyMaterialDiff, moneyToString } from "./money"
import { markPositions, snapshotPortfolio } from "./portfolio"
import { DEFAULT_ACCOUNT_ID, isSyntheticProvenance, type ReconKind } from "./types"

export type BrokerSnapshot = {
  orders?: Array<Record<string, unknown>>
  positions?: Array<{
    exchange: string
    tradingsymbol: string
    product: string
    quantity: number
    average_price?: number
    last_price?: number
  }>
  margins?: {
    equity?: {
      net?: number
      available?: { live_balance?: number }
      utilised?: { span?: number; debits?: number }
    }
  } | null
}

export type ReconcileResult = {
  appliedFills: number
  brokerOrdersSeen: number
  mismatches: number
  snapshot: Awaited<ReturnType<typeof snapshotPortfolio>> | null
}

async function recordMismatch(input: {
  kind: ReconKind
  severity?: string
  tradingsymbol?: string | null
  exchange?: string | null
  product?: string | null
  internalQty?: number | null
  brokerQty?: number | null
  internalAvg?: string | null
  brokerAvg?: string | null
  internalOrderId?: string | null
  brokerOrderId?: string | null
  detail: string
  raw?: Record<string, unknown>
}) {
  await db.insert(reconciliationEvents).values({
    accountId: DEFAULT_ACCOUNT_ID,
    kind: input.kind,
    severity: input.severity ?? "WARN",
    tradingsymbol: input.tradingsymbol ?? null,
    exchange: input.exchange ?? null,
    product: input.product ?? null,
    internalQty: input.internalQty ?? null,
    brokerQty: input.brokerQty ?? null,
    internalAvg: input.internalAvg ?? null,
    brokerAvg: input.brokerAvg ?? null,
    internalOrderId: input.internalOrderId ?? null,
    brokerOrderId: input.brokerOrderId ?? null,
    detail: input.detail,
    raw: input.raw ?? null,
  })
  await recordAuditEvent({
    eventType: "RECONCILIATION_MISMATCH",
    summary: input.detail,
    detail: { kind: input.kind },
    severity: input.severity ?? "WARN",
  })
}

export async function reconcileWithBroker(
  broker?: BrokerSnapshot | null
): Promise<ReconcileResult> {
  await backfillFromTransactions()
  const appliedFills = await applyUnappliedFills()
  let brokerOrdersSeen = 0
  let mismatches = 0
  const skipLiveBroker = isMockOrder() || !broker

  if (!skipLiveBroker && broker?.orders) {
    const knownBefore = new Set(
      (await db.select({ brokerOrderId: orders.brokerOrderId }).from(orders))
        .map(r => r.brokerOrderId)
        .filter((id): id is string => Boolean(id))
    )

    for (const raw of broker.orders) {
      brokerOrdersSeen += 1
      const id = String((raw as { order_id?: string }).order_id || "")
      if (id && !knownBefore.has(id)) {
        mismatches += 1
        await recordMismatch({
          kind: "UNEXPECTED_ORDER",
          brokerOrderId: id,
          tradingsymbol: String((raw as { tradingsymbol?: string }).tradingsymbol || ""),
          detail: "Kite order had no internal row before this reconcile (now ingested)",
          raw: raw as Record<string, unknown>,
        })
      }
      await applyBrokerOrderSnapshot(raw as Parameters<typeof applyBrokerOrderSnapshot>[0], {
        provenance: "RECONCILED",
      })
    }

    const openInternal = (await getOpenOrders()).filter(
      order => !isSyntheticProvenance(order.provenance)
    )
    const brokerIds = new Set(
      broker.orders.map(o => String((o as { order_id?: string }).order_id || "")).filter(Boolean)
    )
    for (const order of openInternal) {
      if (order.brokerOrderId && !brokerIds.has(order.brokerOrderId)) {
        mismatches += 1
        await recordMismatch({
          kind: "MISSING_ORDER",
          internalOrderId: order.id,
          brokerOrderId: order.brokerOrderId,
          tradingsymbol: order.tradingsymbol,
          exchange: order.exchange,
          product: order.product,
          detail: `Internal order ${order.status} not present in Kite book`,
        })
      }
      if (!order.brokerOrderId && (order.status === "PENDING" || order.status === "UNKNOWN")) {
        const ageMs = Date.now() - new Date(order.createdAt).getTime()
        if (ageMs > 5 * 60 * 1000) {
          mismatches += 1
          await recordMismatch({
            kind: "STALE_PENDING",
            internalOrderId: order.id,
            tradingsymbol: order.tradingsymbol,
            detail: `Order ${order.id} still ${order.status} after ${Math.round(ageMs / 1000)}s`,
          })
        }
      }
    }
  }

  const marks = new Map<string, string>()
  if (!skipLiveBroker && broker?.positions) {
    const internal = await db.select().from(positions)
    const agg = new Map<string, { qty: number; cost: bigint; absQty: number }>()
    for (const pos of internal) {
      if (isSyntheticProvenance(pos.provenance)) continue
      const key = `${pos.exchange}|${pos.tradingsymbol}|${pos.product || ""}`
      const cur = agg.get(key) ?? { qty: 0, cost: 0n, absQty: 0 }
      cur.qty += pos.quantity
      cur.cost += moneyFromUnknown(pos.averageEntryPrice) * BigInt(Math.abs(pos.quantity))
      cur.absQty += Math.abs(pos.quantity)
      agg.set(key, cur)
    }

    for (const bp of broker.positions) {
      const key = `${bp.exchange}|${bp.tradingsymbol}|${bp.product || ""}`
      if (bp.last_price != null)
        marks.set(`${bp.exchange}:${bp.tradingsymbol}`, String(bp.last_price))
      const local = agg.get(key) ?? { qty: 0, cost: 0n, absQty: 0 }
      if (local.qty !== bp.quantity) {
        mismatches += 1
        await recordMismatch({
          kind: "POSITION_MISMATCH",
          tradingsymbol: bp.tradingsymbol,
          exchange: bp.exchange,
          product: bp.product,
          internalQty: local.qty,
          brokerQty: bp.quantity,
          detail: `Internal qty ${local.qty} vs broker ${bp.quantity}`,
        })
      } else if (bp.average_price != null && local.absQty > 0) {
        const localAvg = local.cost / BigInt(local.absQty)
        if (moneyMaterialDiff(localAvg, moneyFromUnknown(bp.average_price))) {
          mismatches += 1
          await recordMismatch({
            kind: "AVG_PRICE",
            severity: "INFO",
            tradingsymbol: bp.tradingsymbol,
            exchange: bp.exchange,
            product: bp.product,
            internalAvg: moneyToString(localAvg),
            brokerAvg: String(bp.average_price),
            detail: "Average price differs from broker",
          })
        }
      }
    }
    if (marks.size) await markPositions(marks)
  }

  const snapshot = await snapshotPortfolio({
    source: broker?.margins ? "BROKER" : "INTERNAL",
    availableCash:
      broker?.margins?.equity?.available?.live_balance ?? broker?.margins?.equity?.net ?? null,
    usedMargin: broker?.margins?.equity?.utilised?.debits ?? null,
    span: broker?.margins?.equity?.utilised?.span ?? null,
    rawMargins: (broker?.margins as Record<string, unknown>) ?? null,
    marks,
  })

  await recordAuditEvent({
    eventType: "RECONCILIATION_COMPLETED",
    summary: `fills=${appliedFills} kiteOrders=${brokerOrdersSeen} mismatches=${mismatches}`,
    detail: { appliedFills, brokerOrdersSeen, mismatches },
    idempotencyKey: `recon:${new Date().toISOString().slice(0, 16)}`,
  })

  return { appliedFills, brokerOrdersSeen, mismatches, snapshot }
}

export async function fetchBrokerSnapshot(kite: {
  getOrders: () => Promise<unknown>
  getPositions: () => Promise<{ net?: BrokerSnapshot["positions"] }>
  getMargins?: () => Promise<BrokerSnapshot["margins"]>
}): Promise<BrokerSnapshot> {
  const [orderList, positionBook, margins] = await Promise.all([
    kite.getOrders(),
    kite.getPositions(),
    kite.getMargins ? kite.getMargins() : Promise.resolve(null),
  ])
  return {
    orders: (orderList as Record<string, unknown>[]) || [],
    positions: positionBook?.net || [],
    margins,
  }
}
