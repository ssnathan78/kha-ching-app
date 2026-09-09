import logger from "../logger"
import { clearPhantomPosition } from "./clearPhantomBook"
import { getOpenOrders, getOpenPositions, recordAuditEvent } from "./ledger"
import { cancelPaperWorkingOrders } from "./paperExecution"
import type { RiskStrategyKey } from "./riskEngine"
import { isSyntheticProvenance, ledgerProvenance, type Provenance } from "./types"

/**
 * Paper → Live: throw away the paper trial. Never sends a Kite order.
 * Live leftover is not archived here — switching to Live is blocked if Kite/live has size.
 */
export async function prepareStrategyGoLive(input: {
  strategy: RiskStrategyKey
  actor?: string
}): Promise<{ ok: true; archived: number } | { ok: false; error: string }> {
  const open = await getOpenPositions()
  const paperRows = open.filter(row => {
    if (row.strategy !== input.strategy) return false
    if (Number(row.quantity || 0) === 0) return false
    return isSyntheticProvenance(ledgerProvenance(row.provenance as Provenance | null))
  })

  const symbols = new Set(
    paperRows.map(row => row.tradingsymbol).filter((s): s is string => Boolean(s))
  )
  const working = await getOpenOrders()
  const paperWorking = working.filter(o => {
    if (!isSyntheticProvenance(ledgerProvenance(o.provenance as Provenance | null))) return false
    if (o.strategy && o.strategy !== input.strategy) return false
    if (o.strategy === input.strategy) return true
    return Boolean(o.tradingsymbol && symbols.has(o.tradingsymbol))
  })
  const cancelKeys = new Set(
    paperWorking.filter(o => o.tradingsymbol).map(o => `${o.tradingsymbol}\0${o.side}`)
  )
  for (const key of cancelKeys) {
    const [tradingsymbol, side] = key.split("\0")
    await cancelPaperWorkingOrders({ tradingsymbol, side })
  }

  let archived = 0
  for (const row of paperRows) {
    const result = await clearPhantomPosition({
      positionId: row.id,
      confirm: "CLEAR",
      actor: input.actor ?? "USER",
    })
    if (!result.ok) {
      return { ok: false, error: result.error }
    }
    archived += 1
  }

  if (input.strategy === "CHASE") {
    try {
      const { resetChaseSignalState } = await import("../chaseReset")
      const reset = await resetChaseSignalState({ force: true })
      if (!reset.ok) {
        return { ok: false, error: reset.error }
      }
    } catch (e) {
      logger.error("[prepareStrategyGoLive] Chase reset failed", e)
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Chase signal reset failed",
      }
    }
  }

  await recordAuditEvent({
    eventType: "MANUAL_INTERVENTION",
    actor: input.actor ?? "USER",
    severity: "INFO",
    summary: `${input.strategy} Paper → Live: archived ${archived} paper position(s), Chase reset if any`,
    detail: { strategy: input.strategy, archived, book: "PAPER", kite: false },
    idempotencyKey: `go-live:${input.strategy}:${new Date().toISOString().slice(0, 16)}`,
  })

  logger.info("[prepareStrategyGoLive]", { strategy: input.strategy, archived })
  return { ok: true, archived }
}
