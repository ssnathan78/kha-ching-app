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

worker.on("error", err => {
  logger.error("🔴 [exitTradingQueue] worker error", err)
})

export { processExitJob, worker }
