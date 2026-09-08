import { and, eq } from "drizzle-orm"

import { db } from "../drizzle"
import logger from "../logger"
import { positionEvents, positions, trades } from "../schema"
import { isMockOrder } from "../utils"
import { phantomClearBlocked } from "./bookSplit"
import { getOpenOrders, getOpenPositions, recordAuditEvent } from "./ledger"
import { isSyntheticProvenance, ledgerProvenance } from "./types"

export const PHANTOM_CLEAR_CONFIRM = "CLEAR"

export async function clearPhantomPosition(input: {
  positionId: string
  confirm: string
  actor?: string
  accessToken?: string
}): Promise<
  | { ok: true; positionId: string; strategy: string | null; clearedQty: number }
  | { ok: false; error: string }
> {
  if (input.confirm !== PHANTOM_CLEAR_CONFIRM) {
    return {
      ok: false,
      error: `Type ${PHANTOM_CLEAR_CONFIRM} to confirm. This does not send a Kite order.`,
    }
  }
  const row = (await db.select().from(positions).where(eq(positions.id, input.positionId)))[0]
  if (!row) return { ok: false, error: "Position not found" }
  const qty = Number(row.quantity || 0)
  if (qty === 0 || row.status !== "OPEN") {
    return { ok: false, error: "That ledger row is already flat" }
  }

  const paperBook = isSyntheticProvenance(
    ledgerProvenance(row.provenance as "PAPER" | "MOCK" | "LIVE")
  )
  const processMock = isMockOrder()
  const working = (await getOpenOrders()).filter(order => {
    if (order.tradingsymbol !== row.tradingsymbol) return false
    const paperOrder = isSyntheticProvenance(order.provenance)
    return paperBook ? paperOrder : !paperOrder
  })

  let kiteAvailable = processMock || paperBook
  let kiteQty = 0
  if (!paperBook && !processMock) {
    if (!input.accessToken) {
      return {
        ok: false,
        error:
          "Log in to Kite so we can prove the broker is flat before clearing a live ledger row.",
      }
    }
    try {
      const { getKiteInstance, getNetPositionQty } = await import("../kiteUtils")
      kiteQty = await getNetPositionQty(getKiteInstance(input.accessToken), row.tradingsymbol, {
        ledgerFallback: false,
      })
      kiteAvailable = true
    } catch (e) {
      logger.warn("[clearPhantomPosition] kite qty unavailable", e)
      kiteAvailable = false
    }
  }

  const blocked = phantomClearBlocked({
    paperBook,
    processMock,
    workingOrders: working.length,
    kiteAvailable,
    kiteQty,
  })
  if (!blocked.ok) return blocked

  const now = new Date()
  await db
    .update(positions)
    .set({
      quantity: 0,
      status: "FLAT",
      closedAt: now,
      unrealizedPnl: "0",
      marketValue: "0",
      updatedAt: now,
    })
    .where(eq(positions.id, row.id))

  await db.insert(positionEvents).values({
    positionId: row.id,
    eventKind: "CLOSED",
    quantityBefore: qty,
    quantityAfter: 0,
    reason: "OPERATOR_CLEAR_PHANTOM",
    occurredAt: now,
  })

  await db
    .update(trades)
    .set({
      status: "CLOSED",
      exitQty: Math.abs(qty),
      exitAt: now,
      exitReason: "MANUAL",
    })
    .where(and(eq(trades.positionId, row.id), eq(trades.status, "OPEN")))

  await recordAuditEvent({
    eventType: "MANUAL_INTERVENTION",
    positionId: row.id,
    actor: input.actor ?? "USER",
    severity: "WARN",
    summary: `Cleared phantom ${row.strategy || "book"} ${row.tradingsymbol} qty ${qty} (${row.provenance})`,
    detail: {
      source: "LEDGER",
      strategy: row.strategy,
      symbol: row.tradingsymbol,
      book: paperBook ? "PAPER" : "LIVE",
      clearedQty: qty,
    },
    idempotencyKey: `phantom-clear:${row.id}:${now.toISOString()}`,
  })

  if (row.strategy === "CHASE") {
    const stillOpen = (await getOpenPositions()).some(
      p => p.strategy === "CHASE" && p.quantity !== 0
    )
    if (!stillOpen) {
      try {
        const { resetChaseSignalState } = await import("../chaseReset")
        await resetChaseSignalState({ accessToken: input.accessToken, force: true })
      } catch (e) {
        logger.warn("[clearPhantomPosition] Chase signal reset skipped", e)
      }
    }
  }

  logger.info("[clearPhantomPosition] cleared", {
    id: row.id,
    strategy: row.strategy,
    qty,
    provenance: row.provenance,
  })
  return {
    ok: true,
    positionId: row.id,
    strategy: row.strategy,
    clearedQty: qty,
  }
}
