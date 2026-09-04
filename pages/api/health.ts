import type { NextApiRequest, NextApiResponse } from "next"
import { pool } from "../../lib/drizzle"
import logger from "../../lib/logger"
import { redisConnection } from "../../lib/queue"

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
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
