import { chaseStatusHasPosition } from "./chaseFill"
import { getChaseSettings } from "./chaseSettings"
import { resolveChaseBookBreakdown } from "./chaseSignal"
import { CHASE_STATUS } from "./constants"
import { getChaseStatus, updateChaseStatus } from "./drizzleDbUtils"
import { cancelOrder } from "./kiteUtils"
import logger from "./logger"

export type ChaseResetResult =
  | { ok: true; instrument: string; previousStatus: string | null }
  | { ok: false; error: string; instrument: string; previousStatus: string | null }

/**
 * Drop a phantom LONG/SHORT (or a stuck pending entry) back to AWAITING_SIGNAL
 * so the next hourly job can evaluate a fresh signal.
 *
 * Refuses when the Chase book actually has size, unless `force` is set.
 * Does not flatten Kite — use Square off on Today / Chase / Desk → Positions for that.
 */
export async function resetChaseSignalState(input: {
  instrument?: string
  accessToken?: string
  force?: boolean
}): Promise<ChaseResetResult> {
  const instrument = input.instrument || "NIFTY"
  const row = await getChaseStatus(instrument)
  const previousStatus = row?.status ?? null
  const tradingsymbol = row?.tradingsymbol ?? null

  if (!input.force && tradingsymbol && (previousStatus === "LONG" || previousStatus === "SHORT")) {
    const book = await resolveChaseBookBreakdown(tradingsymbol, input.accessToken || "")
    if (chaseStatusHasPosition(previousStatus, book.netQty)) {
      return {
        ok: false,
        instrument,
        previousStatus,
        error:
          "Chase still has an open book. Square off that position first (Today, Chase plan, or Desk → Positions). Reset only clears a stuck signal.",
      }
    }
  }

  if (tradingsymbol && input.accessToken) {
    const side =
      previousStatus === CHASE_STATUS.LONG || previousStatus === CHASE_STATUS.AWAITING_LONG
        ? "BUY"
        : "SELL"
    try {
      await cancelOrder(tradingsymbol, side, input.accessToken)
    } catch (e) {
      logger.warn("[resetChaseSignalState] cancel pending entry skipped", e)
    }
  }

  const { success, error } = await updateChaseStatus({
    instrument,
    status: CHASE_STATUS.AWAITING_SIGNAL,
    tradingsymbol: "",
    entryPoint: 0,
    stoploss: 0,
    instrumentToken: 0,
    isSignalBreachingTolerance: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  if (!success) {
    return {
      ok: false,
      instrument,
      previousStatus,
      error: error instanceof Error ? error.message : "Could not update chase_status",
    }
  }

  const chase = await getChaseSettings()
  logger.info(`[resetChaseSignalState] ${instrument} ${previousStatus} → AWAITING_SIGNAL`, {
    lots: chase.lots,
  })
  return { ok: true, instrument, previousStatus }
}
