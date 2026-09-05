import type { NextApiRequest, NextApiResponse } from "next"
import { pool } from "../../lib/drizzle"
import logger from "../../lib/logger"
import { redisConnection } from "../../lib/queue"

function isHealthAuthorized(req: NextApiRequest): boolean {
  const token = process.env.HEALTH_CHECK_TOKEN?.trim()
  if (!token) {
    return true
  }

  const authHeader = req.headers.authorization
  if (typeof authHeader === "string" && authHeader === `Bearer ${token}`) {
    return true
  }

  const headerToken = req.headers["x-health-token"]
  if (typeof headerToken === "string" && headerToken === token) {
    return true
  }

  return false
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isHealthAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  const checks: { postgres: string; redis: string } = {
    postgres: "ok",
    redis: "ok",
  }

  try {
    await pool.query("SELECT 1")
  } catch (e) {
    logger.error("[health] postgres failed", e)
    checks.postgres = "error"
  }

  try {
    const pong = await redisConnection.ping()
    if (pong !== "PONG") {
      checks.redis = "error"
    }
  } catch (e) {
    logger.error("[health] redis failed", e)
    checks.redis = "error"
  }

  const ok = checks.postgres === "ok" && checks.redis === "ok"
  const payload = {
    status: ok ? "ok" : "degraded",
    service: "kha-ching",
    timestamp: new Date().toISOString(),
    checks,
  }

  if (!ok) {
    logger.error("[health] Health check failed", payload)
    return res.status(503).json(payload)
  }

  res.status(200).json(payload)
}
