import dayjs from "dayjs"
import { desc, eq } from "drizzle-orm"
import { customAlphabet } from "nanoid"
import { sendApiError } from "../../lib/apiErrors"
import { JOB_EXECUTION_STATUS, USER_OVERRIDE } from "../../lib/constants"
import { toClientJobExecution } from "../../lib/dashboardJobActions"
import { db } from "../../lib/drizzle"
import { istToday } from "../../lib/drizzleIst"
import { abortJobExecution, forceRemoveQueuedJob } from "../../lib/jobControl"
import { mapJobExecutionInsert, mapJobExecutionQueuePayload } from "../../lib/jobExecutionMapper"
import logger from "../../lib/logger"
import { addToChaseQueue, addToNextQueue, TRADING_Q_NAME } from "../../lib/queue"
import { jobExecutions } from "../../lib/schema"

import withSession from "../../lib/session"
import { validateTradeJobPayload } from "../../lib/strategyValidation"
import { isMarketOpen, isMockOrder } from "../../lib/utils"
import type { KiteUser } from "../../types/misc"
import type { SUPPORTED_TRADE_CONFIG } from "../../types/trade"

const nanoid = customAlphabet("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz", 8)

function logJobSchedule(body: Record<string, unknown>) {
  logger.info("[trades_day] POST schedule", {
    strategy: body.strategy,
    instrument: body.instrument,
    lots: body.lots,
    exitStrategy: body.exitStrategy,
    runNow: body.runNow,
  })
}

async function createJob({ jobData, user }: { jobData: SUPPORTED_TRADE_CONFIG; user: KiteUser }) {
  const { runAt, runNow, strategy } = jobData

  if (!isMockOrder() && runNow && !isMarketOpen()) {
    return Promise.reject(new Error("Exchange is offline right now."))
  }

  if (!isMockOrder() && !runNow && runAt && !isMarketOpen(dayjs(runAt))) {
    return Promise.reject(new Error("Exchange would be offline at the scheduled time."))
  }

  return addToNextQueue(
    {
      ...jobData,
      user,
    },
    {
      _nextTradingQueue: TRADING_Q_NAME,
    }
  )
}

function parseAbortOverride(body: Record<string, unknown>): string | null {
  const override = body.userOverride ?? body.user_override
  if (override == null) return null
  if (override === USER_OVERRIDE.ABORT) return USER_OVERRIDE.ABORT
  return null
}

export default withSession(async (req, res) => {
  const user = req.session.user

  if (!user) {
    return res.status(401).end()
  }

  if (req.method === "POST") {
    const { getMaxLotsForStrategy } = await import("../../lib/trading/riskSettings")
    const validation = validateTradeJobPayload(req.body, {
      maxLots: await getMaxLotsForStrategy((req.body as { strategy?: string }).strategy),
    })
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error })
    }

    let executionData: Record<string, unknown>
    const orderTag = nanoid()
    try {
      logJobSchedule(req.body)
      const inserted = await db
        .insert(jobExecutions)
        .values({
          ...mapJobExecutionInsert(req.body),
          orderTag,
          status: JOB_EXECUTION_STATUS.PENDING,
          createdAt: new Date(),
        })
        .returning()

      if (inserted.length === 0) {
        throw new Error("Failed to insert job execution")
      }
      executionData = inserted[0]
      logger.info(`[trades_day] ${executionData.id} created in job_executions`)
    } catch (e) {
      return sendApiError(res, e, logger, "trades_day POST")
    }

    const queuePayload = mapJobExecutionQueuePayload(req.body, executionData, orderTag)

    try {
      if (executionData.strategy === "SUBSCRIBE_CHASE") {
        await addToChaseQueue(user)
        await db
          .update(jobExecutions)
          .set({
            status: JOB_EXECUTION_STATUS.QUEUE,
            queue: { id: executionData.id, type: "chase" },
          })
          .where(eq(jobExecutions.id, executionData.id as string))
        return res.json(executionData)
      }

      const qRes = await createJob({
        jobData: queuePayload as unknown as SUPPORTED_TRADE_CONFIG,
        user,
      })

      if (!qRes) {
        throw new Error("Failed to enqueue job")
      }

      const queueInfo = {
        id: qRes.id,
        name: qRes.name,
        opts: qRes.opts,
        timestamp: qRes.timestamp,
      }

      await db
        .update(jobExecutions)
        .set({ status: JOB_EXECUTION_STATUS.QUEUE, queue: queueInfo })
        .where(eq(jobExecutions.id, executionData.id as string))

      return res.json(executionData)
    } catch (e) {
      logger.error("[trades_day] job creation failed", e)
      await db
        .update(jobExecutions)
        .set({
          status: JOB_EXECUTION_STATUS.REJECT,
          queue: { error: e instanceof Error ? e.message : String(e) },
        })
        .where(eq(jobExecutions.id, executionData.id as string))

      return res.json(executionData)
    }
  }

  if (req.method === "DELETE") {
    try {
      const jobId = req.body?.id as string
      if (!jobId) {
        return res.status(400).json({ error: "id is required" })
      }
      const rows = await db
        .select({ queue: jobExecutions.queue })
        .from(jobExecutions)
        .where(eq(jobExecutions.id, jobId))

      if (rows.length === 0) {
        return res.status(404).json({ error: "Job not found" })
      }

      const queueInfo = rows[0]?.queue as { id?: string } | undefined
      if (queueInfo?.id) {
        await forceRemoveQueuedJob(queueInfo.id)
      }

      await db.delete(jobExecutions).where(eq(jobExecutions.id, jobId))
      return res.end()
    } catch (e) {
      return sendApiError(res, e, logger, "trades_day DELETE")
    }
  }

  if (req.method === "PUT") {
    try {
      const { id } = req.body || {}
      if (!id) {
        return res.status(400).json({ error: "id is required" })
      }
      if (req.body.status != null) {
        return res
          .status(400)
          .json({ error: "status cannot be set directly; use userOverride ABORT" })
      }

      const abortOverride = parseAbortOverride(req.body)
      if (abortOverride === USER_OVERRIDE.ABORT) {
        await abortJobExecution(id)
        return res.end()
      }

      const override = req.body.userOverride ?? req.body.user_override
      if (override != null) {
        return res.status(400).json({ error: "Only userOverride ABORT is allowed" })
      }

      return res.status(400).json({ error: "userOverride ABORT is required" })
    } catch (e) {
      return sendApiError(res, e, logger, "trades_day PUT")
    }
  }

  if (req.method === "GET") {
    try {
      const results = await db
        .select()
        .from(jobExecutions)
        .where(istToday(jobExecutions.createdAt))
        .orderBy(desc(jobExecutions.createdAt))
      return res.json(results.map(row => toClientJobExecution(row)))
    } catch (e) {
      return sendApiError(res, e, logger, "trades_day GET")
    }
  }

  res.status(400).end()
})
