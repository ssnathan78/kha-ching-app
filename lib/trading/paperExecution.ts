import logger from "../logger"
import { applyBrokerOrderSnapshot, getOpenOrders } from "./ledger"
import type { OrderPurpose } from "./types"
import { isSyntheticProvenance, ledgerProvenance } from "./types"

export function isPaperStopOrderType(orderType?: string | null): boolean {
  const type = (orderType || "").toUpperCase()
  return type === "SL" || type === "SL-M" || type === "SL-L"
}

/** Buy stop triggers on the high; sell stop on the low. Last is used at submit time. */
export function paperStopTriggered(input: {
  side: string
  triggerPrice?: number | null
  last: number
  high?: number
  low?: number
}): boolean {
  const trigger = Number(input.triggerPrice)
  if (!Number.isFinite(trigger) || trigger <= 0) return false
  const last = Number(input.last)
  const high = Number(input.high ?? last)
  const low = Number(input.low ?? last)
  const buy = (input.side || "").toUpperCase() === "BUY"
  if (buy) {
    return (Number.isFinite(high) && high >= trigger) || (Number.isFinite(last) && last >= trigger)
  }
  return (Number.isFinite(low) && low <= trigger) || (Number.isFinite(last) && last <= trigger)
}

export function shouldFillPaperOrderNow(input: {
  orderType?: string | null
  side: string
  triggerPrice?: number | null
  last: number
  high?: number
  low?: number
}): boolean {
  if (!isPaperStopOrderType(input.orderType)) return true
  return paperStopTriggered(input)
}

export async function matchPaperWorkingStops(input: {
  tradingsymbol: string
  last: number
  high?: number
  low?: number
}): Promise<number> {
  const open = await getOpenOrders()
  let filled = 0
  for (const row of open) {
    if (row.tradingsymbol !== input.tradingsymbol) continue
    if (!isSyntheticProvenance(ledgerProvenance(row.provenance))) continue
    if (!isPaperStopOrderType(row.orderType)) continue
    const remaining = row.remainingQty || row.requestedQty - row.filledQty
    if (remaining <= 0) continue
    if (
      !paperStopTriggered({
        side: row.side,
        triggerPrice: row.stopPrice != null ? Number(row.stopPrice) : null,
        last: input.last,
        high: input.high,
        low: input.low,
      })
    ) {
      continue
    }
    const fillPrice =
      Number.isFinite(input.last) && input.last > 0 ? input.last : Number(row.stopPrice)
    logger.info(
      `[matchPaperWorkingStops] filling paper ${row.orderType} ${row.side} ${row.tradingsymbol} qty=${remaining} @ ${fillPrice}`
    )
    await applyBrokerOrderSnapshot(
      {
        order_id: row.brokerOrderId || `paper:${row.id}`,
        status: "COMPLETE",
        tradingsymbol: row.tradingsymbol,
        exchange: row.exchange,
        transaction_type: row.side,
        order_type: row.orderType ?? undefined,
        product: row.product ?? undefined,
        quantity: row.requestedQty,
        filled_quantity: row.requestedQty,
        pending_quantity: 0,
        average_price: fillPrice,
        trigger_price: row.stopPrice != null ? Number(row.stopPrice) : undefined,
        price: row.limitPrice != null ? Number(row.limitPrice) : undefined,
        tag: row.orderTag ?? undefined,
      },
      {
        internalOrderId: row.id,
        provenance: ledgerProvenance(row.provenance),
        purpose: row.purpose as OrderPurpose,
      }
    )
    filled += 1
  }
  return filled
}

export async function cancelPaperWorkingOrders(input: {
  tradingsymbol: string
  side: string
}): Promise<number> {
  const open = await getOpenOrders()
  let cancelled = 0
  for (const row of open) {
    if (row.tradingsymbol !== input.tradingsymbol) continue
    if (row.side !== input.side) continue
    if (!isSyntheticProvenance(ledgerProvenance(row.provenance))) continue
    logger.info(
      `[cancelPaperWorkingOrders] cancelling paper ${row.side} ${row.tradingsymbol} ${row.id}`
    )
    await applyBrokerOrderSnapshot(
      {
        order_id: row.brokerOrderId || `paper:${row.id}`,
        status: "CANCELLED",
        tradingsymbol: row.tradingsymbol,
        exchange: row.exchange,
        transaction_type: row.side,
        order_type: row.orderType ?? undefined,
        product: row.product ?? undefined,
        quantity: row.requestedQty,
        filled_quantity: row.filledQty,
        pending_quantity: row.remainingQty,
        tag: row.orderTag ?? undefined,
      },
      {
        internalOrderId: row.id,
        provenance: ledgerProvenance(row.provenance),
        purpose: row.purpose as OrderPurpose,
      }
    )
    cancelled += 1
  }
  return cancelled
}
