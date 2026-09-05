require("dotenv").config()

const express = require("express")
const { createBullBoard } = require("@bull-board/api")
const { BullMQAdapter } = require("@bull-board/api/bullMQAdapter")
const { ExpressAdapter } = require("@bull-board/express")
const { Queue } = require("bullmq")
const IORedis = require("ioredis")
const { sessionMiddleware } = require("../lib/sessionExpress")

const redisUrl = process.env.REDIS_URL
const QID = process.env.KITE_API_KEY

if (process.env.NODE_ENV === "production" && process.env.BULL_BOARD_STANDALONE !== "true") {
  console.error(
    "[bull-board] Refusing to start standalone Bull Board in production. Set BULL_BOARD_STANDALONE=true if intentional."
  )
  process.exit(1)
}

if (!redisUrl || !QID) {
  console.error("Missing REDIS_URL or KITE_API_KEY in .env")
  process.exit(1)
}

function requireLoggedInUser(req, res, nextFn) {
  const user = req.session?.user
  if (!user) {
    return res.status(401).send("Unauthorized")
  }
  return nextFn()
}

const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null })

const queues = [
  `tradingQueue_${QID}`,
  `exitTradingQueue_${QID}`,
  `autoSquareOffQueue_${QID}`,
  `ancillaryQueue_${QID}`,
  `targetPnlQueue_${QID}`,
  `chaseQueue_${QID}`,
].map(name => new Queue(name, { connection }))

const serverAdapter = new ExpressAdapter()
serverAdapter.setBasePath("/queues")

createBullBoard({
  queues: queues.map(q => new BullMQAdapter(q)),
  serverAdapter,
})

const app = express()
app.use("/queues", sessionMiddleware, requireLoggedInUser, serverAdapter.getRouter())

const PORT = process.env.BULL_BOARD_PORT || 3001
const HOST = "127.0.0.1"

app.listen(PORT, HOST, () => {
  console.log(`Bull Board running at http://${HOST}:${PORT}/queues (session required)`)
})
