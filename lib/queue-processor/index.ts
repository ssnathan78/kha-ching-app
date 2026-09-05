import "./ancillaryQueue"
import "./squareOffQueue"
import "./exitTradingQueue"
import "./tradingQueue"
import "./targetPnLQueue"
import { redisConnection } from "../queue"
import { worker as ancillaryWorker } from "./ancillaryQueue"
import { worker as chaseWorker } from "./chaseQueue"
import { worker as exitWorker } from "./exitTradingQueue"
import { worker as squareOffWorker } from "./squareOffQueue"
import { worker as targetPnLWorker } from "./targetPnLQueue"
import { worker as tradingWorker } from "./tradingQueue"

const workers = [
  tradingWorker,
  exitWorker,
  squareOffWorker,
  ancillaryWorker,
  targetPnLWorker,
  chaseWorker,
]

export async function closeAllWorkers() {
  await Promise.all(workers.map(worker => worker.close()))
  await redisConnection.quit()
}

declare global {
  // eslint-disable-next-line no-var
  var __khaChingCloseWorkers: (() => Promise<void>) | undefined
}

global.__khaChingCloseWorkers = closeAllWorkers
