import { Worker } from "bullmq"
import { processExitJob } from "../exit-strategies/processExitJob"
import logger from "../logger"
import { EXIT_TRADING_Q_NAME, redisConnection } from "../queue"
import { getCustomBackoffStrategies, ms } from "../utils"

const worker = new Worker(
  EXIT_TRADING_Q_NAME,
  async job => {
    try {
      const exitOrders = await processExitJob(job.data)
      return exitOrders
    } catch (e) {
      logger.info(e.message ? e.message : e)
      throw new Error(e)
    }
  },
  {
    connection: redisConnection,
    concurrency: 100,
    settings: {
      backoffStrategy: getCustomBackoffStrategies(),
    },
    lockDuration: ms(5 * 60),
  }
)

worker.on("failed", async (job, err) => {
  logger.error("🔴 [exitTradingQueue] worker failed", {
    jobId: job?.id,
    error: err?.message || err,
  })
  const maxAttempts = job?.opts?.attempts ?? 0
  const isFinalFailure = !job || maxAttempts === 0 || job.attemptsMade >= maxAttempts
  if (!isFinalFailure) return
  const { recordOperatorAlert } = await import("../trading/alerts")
  await recordOperatorAlert({
    source: "JOB",
    code: "EXIT_JOB_FAILED",
    severity: "ERROR",
    summary: err?.message || "Exit job failed",
    jobId: typeof job?.data?.id === "string" ? job.data.id : null,
    strategy: typeof job?.data?.strategy === "string" ? job.data.strategy : null,
    instrument: typeof job?.data?.instrument === "string" ? job.data.instrument : null,
    idempotencyKey: `alert:exit-fail:${job?.data?.id || job?.id}`,
  })
})

worker.on("error", err => {
  logger.error("🔴 [exitTradingQueue] worker error", err)
})

export { processExitJob, worker }
