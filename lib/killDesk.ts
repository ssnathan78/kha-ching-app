import type { KiteUser } from "../types/misc"
import { saveChaseSettings } from "./chaseSettings"
import { CHASE_STATUS } from "./constants"
import { updateChaseStatus } from "./drizzleDbUtils"
import { flattenOpenPositions } from "./flattenOpen"
import { abortTodaysJobExecutions } from "./jobControl"
import logger from "./logger"

export type KillDeskScope = "intraday" | "all"

export async function runDeskKill(scope: KillDeskScope, user: KiteUser) {
  try {
    await flattenOpenPositions({
      user,
      scope: scope === "all" ? { kind: "all" } : { kind: "intraday" },
      abortOptionJobs: false,
    })
  } catch (e) {
    logger.error("[runDeskKill] flatten failed", e)
  }

  const aborted = await abortTodaysJobExecutions(scope)

  if (scope === "all") {
    try {
      await saveChaseSettings({ paused: true })
    } catch (e) {
      logger.error("[runDeskKill] could not pause Chase", e)
    }
    try {
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
      logger.error("[runDeskKill] Chase status reset failed", e)
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
