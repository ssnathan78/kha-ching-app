import type { KiteUser } from "../types/misc"
import { saveChaseSettings } from "./chaseSettings"
import { CHASE_STATUS } from "./constants"
import { updateChaseStatus } from "./drizzleDbUtils"
import { squareOffTag } from "./exit-strategies/autoSquareOff"
import { abortTodaysJobExecutions } from "./jobControl"
import { syncGetKiteInstance } from "./kiteUtils"
import logger from "./logger"
import { isMockOrder } from "./utils"

export type KillDeskScope = "intraday" | "all"

export async function runDeskKill(scope: KillDeskScope, user: KiteUser) {
  const aborted = await abortTodaysJobExecutions(scope)

  if (scope === "all") {
    try {
      await saveChaseSettings({ paused: true })
    } catch (e) {
      logger.error("[runDeskKill] could not pause Chase", e)
    }
  }

  if (!isMockOrder() && user.session?.access_token) {
    try {
      const kite = syncGetKiteInstance(user)
      for (const row of aborted) {
        if (!row.orderTag) continue
        try {
          await squareOffTag(row.orderTag, kite, { force: true })
        } catch (e) {
          logger.error(`[runDeskKill] square-off failed for ${row.orderTag}`, e)
        }
      }
      if (scope === "all") {
        try {
          await squareOffTag("chase", kite, { force: true })
          const { getChaseSettings } = await import("./chaseSettings")
          const chase = await getChaseSettings()
          for (const instrument of chase.instruments?.length ? chase.instruments : ["NIFTY"]) {
            await updateChaseStatus({
              instrument,
              status: CHASE_STATUS.AWAITING_SIGNAL,
              updatedAt: new Date(),
            })
          }
        } catch (e) {
          logger.error("[runDeskKill] Chase flatten failed", e)
        }
      }
    } catch (e) {
      logger.error("[runDeskKill] kite square-off skipped", e)
    }
  }

  try {
    const { haltDesk } = await import("./trading/riskSettings")
    await haltDesk(
      scope === "all" ? "Kill desk (all strategies including Chase)" : "Kill desk (intraday)",
      "USER"
    )
  } catch (e) {
    logger.error("[runDeskKill] could not persist desk halt", e)
  }

  return {
    scope,
    aborted: aborted.length,
    chasePaused: scope === "all",
  }
}
