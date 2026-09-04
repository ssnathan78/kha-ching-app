const express = require("express")
const next = require("next")
const { createBullBoard } = require("@bull-board/api")
const { BullMQAdapter } = require("@bull-board/api/bullMQAdapter")
const { ExpressAdapter } = require("@bull-board/express")
const { Queue } = require("bullmq")
const IORedis = require("ioredis")
const { sessionMiddleware } = require("./lib/sessionExpress")

const dev = process.env.NODE_ENV !== "production"
const PORT = parseInt(process.env.PORT || "3000", 10)

const app = next({ dev })
const handle = app.getRequestHandler()

function requireLoggedInUser(req, res, nextFn) {
  const user = req.session.get("user")
  if (!user) {
    return res.status(401).send("Unauthorized")
  }
  return nextFn()
}

async function setupBullBoard(server) {
  const redisUrl = process.env.REDIS_URL
  const QID = process.env.KITE_API_KEY

  if (!redisUrl || !QID) {
    console.warn("[bull-board] Skipping: REDIS_URL or KITE_API_KEY not set")
    return
  }

  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null })

  const keys = await connection.keys("bull:*:meta")
  const queueNames = keys
    .map(key => key.slice("bull:".length, -":meta".length))
    .filter(name => name.endsWith(`_${QID}`))

  if (!queueNames.length) {
    console.warn("[bull-board] No queues found in Redis")
    return
  }

  console.log(`[bull-board] Discovered queues: ${queueNames.join(", ")}`)

  const queues = queueNames.map(name => new Queue(name, { connection }))

  const serverAdapter = new ExpressAdapter()
  serverAdapter.setBasePath("/queues")

  createBullBoard({
    queues: queues.map(q => new BullMQAdapter(q)),
    serverAdapter,
  })

  server.use("/queues", sessionMiddleware, requireLoggedInUser, serverAdapter.getRouter())
  console.log(`[bull-board] Mounted at http://localhost:${PORT}/queues`)
}

app.prepare().then(async () => {
  const server = express()

  await setupBullBoard(server)

  server.all("/{*path}", (req, res) => handle(req, res))

  const httpServer = server.listen(PORT, "0.0.0.0", () => {
    console.log(`> Ready on http://localhost:${PORT}`)
  })

  const shutdown = signal => {
    console.log(`[server] ${signal} received, shutting down`)
    httpServer.close(() => process.exit(0))
    setTimeout(() => process.exit(1), 10000)
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"))
  process.on("SIGINT", () => shutdown("SIGINT"))
})
