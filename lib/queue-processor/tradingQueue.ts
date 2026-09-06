import { type Job, Worker } from "bullmq"

// Removed lodash omit — job data logged without user field when needed

import dayjs from "dayjs"
import { eq } from "drizzle-orm"
import { JOB_EXECUTION_STATUS } from "../constants"
import { db } from "../drizzle"
import logger from "../logger"
import {
  addToAutoSquareOffQueue,
  addToNextQueue,
  redisConnection,
  TARGETPNL_Q_NAME,
  TRADING_Q_NAME,
} from "../queue"
import { jobExecutions } from "../schema"
import { getCustomBackoffStrategies, logDeep, ms } from "../utils"
import { isStaleTradingJob } from "./staleJobGuard"
import { processTradingJob } from "./tradingJobProcessor"

async function processJob(job: Job) {
  return processTradingJob(job.data)
}

const worker = new Worker(
  TRADING_Q_NAME,
  async job => {
    // console.log(`processing tradingQueue id ${job.id}`, omit(job.data, ['user']))
    const scheduledAt = dayjs(job.timestamp + (job.opts.delay ?? 0))
    if (isStaleTradingJob(job.timestamp, job.opts.delay ?? 0)) {
      logger.info(
        `[tradingQueue] Discarding stale job ${job.id} scheduled for ${scheduledAt.toISOString()}`
      )
      throw new Error(`Stale trading job discarded — scheduled for ${scheduledAt.toISOString()}`)
    }
    const result = await processJob(job)
    // console.log(`processed tradingQueue id ${job.id}`, result)
    const { isAutoSquareOffEnabled, strategy } = job.data
    // can't enable auto square off for DOS
    // because we don't know upfront how many orders would get punched
    if (isAutoSquareOffEnabled) {
      try {
        // console.log('enabling auto square off...')
        const asoResponse = await addToAutoSquareOffQueue({
          //eslint-disable-line
          initialJobData: job.data,
          jobResponse: result,
        })
        // const { data, name } = asoResponse
        // console.log('🟢 success enable auto square off', { data, name })
      } catch (e) {
        logger.error("🔴 failed to enable auto square off", e)
        const { recordOperatorAlert } = await import("../trading/alerts")
        await recordOperatorAlert({
          source: "JOB",
          code: "ASO_ENABLE_FAILED",
          severity: "WARN",
          summary: e instanceof Error ? e.message : "Failed to enable auto square off",
          jobId: typeof job.data?.id === "string" ? job.data.id : null,
          strategy: typeof job.data?.strategy === "string" ? job.data.strategy : null,
          instrument: typeof job.data?.instrument === "string" ? job.data.instrument : null,
          idempotencyKey: `alert:aso:${job.data?.id || job.id}`,
        })
      }
    }
    return result
  },
  {
    connection: redisConnection,
    concurrency: 20,
    settings: {
      backoffStrategy: getCustomBackoffStrategies(),
    },
    lockDuration: ms(5 * 60),
  }
)

worker.on("completed", async job => {
  const { data, returnvalue } = job
  try {
    logDeep(returnvalue)
    // console.log(`[tradingQueue] worker is completed ${job.returnvalue}`)
    if (job.returnvalue?._nextTradingQueue) {
      addToNextQueue(data, returnvalue) //adds SL orders
    }
    if (returnvalue?.isTargetEnabled) {
      const targetreturn = { ...returnvalue, _nextTradingQueue: TARGETPNL_Q_NAME }
      addToNextQueue(data, targetreturn) //keeps checking if target is reached.
    }
  } catch (e) {
    logger.info("job return value", job.returnvalue)
    logger.error("failed inside trading queue worked completed event!", e)
  }

  const jobExecutionId = data?.id
  if (!jobExecutionId || typeof jobExecutionId !== "string") return
  try {
    await db
      .update(jobExecutions)
      .set({ status: JOB_EXECUTION_STATUS.COMPLETED })
      .where(eq(jobExecutions.id, jobExecutionId))
  } catch (e) {
    logger.error("🔴 failed to update job_executions status on queue completion", e)
  }
})

worker.on("failed", async (job, err) => {
  logger.error("🔴 [tradingQueue] worker failed", {
    jobId: job?.id,
    error: err?.message || err,
  })

  // Guard: the 'job' argument can be undefined according to the Worker typings.
  // If it's missing, nothing to update in the DB, so bail out early.
  if (!job) {
    return
  }

  try {
    const jobExecutionId = job.data?.id
    if (!jobExecutionId || typeof jobExecutionId !== "string") {
      return
    }

    const maxAttempts = (job.opts as any)?.attempts ?? 0
    const isFinalFailure = maxAttempts === 0 || job.attemptsMade >= maxAttempts
    if (!isFinalFailure) {
      return
    }

    // Read existing queue from DB so we preserve the BullMQ job id.
    // job.data.queue is not set at BullMQ job creation time (it's written
    // to the DB after the job is enqueued), so spreading job.data.queue
    // would overwrite queue.id with undefined.
    const rows = await db
      .select({ queue: jobExecutions.queue })
      .from(jobExecutions)
      .where(eq(jobExecutions.id, jobExecutionId))
    const existingQueue = (rows[0]?.queue as Record<string, unknown>) ?? {}

    await db
      .update(jobExecutions)
      .set({
        status: JOB_EXECUTION_STATUS.FAILED,
        queue: {
          ...existingQueue,
          failedReason: err?.message || String(err),
        },
      })
      .where(eq(jobExecutions.id, jobExecutionId))

    const { recordOperatorAlert } = await import("../trading/alerts")
    const stale = String(err?.message || "").includes("Stale trading job discarded")
    await recordOperatorAlert({
      source: "JOB",
      code: stale ? "JOB_DISCARDED" : "JOB_FAILED",
      severity: "ERROR",
      summary: err?.message || "Trading job failed",
      jobId: jobExecutionId,
      strategy: typeof job.data?.strategy === "string" ? job.data.strategy : null,
      instrument: typeof job.data?.instrument === "string" ? job.data.instrument : null,
      idempotencyKey: `alert:job-fail:${jobExecutionId}`,
    })
  } catch (updateError) {
    logger.error("🔴 failed to update job_executions status on queue failure", updateError)
  }
})

export { worker }
