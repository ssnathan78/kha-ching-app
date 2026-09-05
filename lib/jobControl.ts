import { and, eq, inArray } from "drizzle-orm"

import { INTRADAY_STRATEGIES, USER_OVERRIDE } from "./constants"
import { db } from "./drizzle"
import { istToday } from "./drizzleIst"
import logger from "./logger"
import {
  CHASE_EMA_SCHEDULER_ID,
  CHASE_UPDATE_SL_SCHEDULER_ID,
  chaseQueue,
  tradingQueue,
} from "./queue"
import { jobExecutions } from "./schema"

const CHASE_SCHEDULER_IDS = new Set([CHASE_EMA_SCHEDULER_ID, CHASE_UPDATE_SL_SCHEDULER_ID])

async function removeSchedulerOrJob(queueId: string) {
  if (CHASE_SCHEDULER_IDS.has(queueId) || queueId.includes("chase-")) {
    await chaseQueue.removeJobScheduler(queueId)
    return
  }
  const job = await tradingQueue.getJob(queueId)
  if (job) {
    await job.remove()
  }
}

export async function removeQueuedJob(queueId?: string | null) {
  if (!queueId) return
  try {
    if (CHASE_SCHEDULER_IDS.has(String(queueId))) {
      await removeSchedulerOrJob(String(queueId))
      return
    }
    const job = await tradingQueue.getJob(String(queueId))
    if (job) {
      const state = await job.getState()
      if (state === "waiting" || state === "delayed" || state === "failed") {
        await job.remove()
      }
    }
  } catch (e) {
    logger.error("[removeQueuedJob] failed", e)
  }
}

export async function forceRemoveQueuedJob(queueId?: string | null) {
  if (!queueId) return
  try {
    if (CHASE_SCHEDULER_IDS.has(String(queueId))) {
      await removeSchedulerOrJob(String(queueId))
      return
    }
    const job = await tradingQueue.getJob(String(queueId))
    if (job) {
      await job.remove()
    }
  } catch (e) {
    logger.error("[forceRemoveQueuedJob] failed", e)
  }
}

export async function abortJobExecution(id: string) {
  await db
    .update(jobExecutions)
    .set({ userOverride: USER_OVERRIDE.ABORT, updatedAt: new Date() })
    .where(eq(jobExecutions.id, id))

  const [row] = await db
    .select({ queue: jobExecutions.queue })
    .from(jobExecutions)
    .where(eq(jobExecutions.id, id))
    .limit(1)

  const queueId = (row?.queue as { id?: string } | undefined)?.id
  await removeQueuedJob(queueId)
  const { recordAuditEvent } = await import("./trading/ledger")
  await recordAuditEvent({
    eventType: "MANUAL_INTERVENTION",
    actor: "USER",
    jobId: id,
    summary: "Job aborted",
    idempotencyKey: `abort:${id}`,
  })
}

export async function abortTodaysJobExecutions(scope: "intraday" | "all" = "all") {
  const rows = await db
    .select({
      id: jobExecutions.id,
      queue: jobExecutions.queue,
      strategy: jobExecutions.strategy,
      orderTag: jobExecutions.orderTag,
    })
    .from(jobExecutions)
    .where(
      scope === "intraday"
        ? and(
            istToday(jobExecutions.createdAt),
            inArray(jobExecutions.strategy, [...INTRADAY_STRATEGIES])
          )
        : istToday(jobExecutions.createdAt)
    )

  if (rows.length === 0) {
    return rows
  }

  await db
    .update(jobExecutions)
    .set({ userOverride: USER_OVERRIDE.ABORT, updatedAt: new Date() })
    .where(
      inArray(
        jobExecutions.id,
        rows.map(row => row.id)
      )
    )

  await Promise.all(
    rows.map(row => removeQueuedJob((row.queue as { id?: string } | undefined)?.id))
  )

  return rows
}
