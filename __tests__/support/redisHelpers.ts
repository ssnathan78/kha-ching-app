import IORedis from "ioredis"

import { QID, TRADING_Q_NAME } from "../../lib/queue"

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379"

export const hasRedis = Boolean(process.env.REDIS_URL)

export const describeRedis = hasRedis ? describe : describe.skip

let sharedClient: IORedis | null = null

export function getTestRedis(): IORedis {
  if (!sharedClient) {
    sharedClient = new IORedis(redisUrl, { maxRetriesPerRequest: null })
  }
  return sharedClient
}

export async function closeTestRedis() {
  if (sharedClient) {
    await sharedClient.quit()
    sharedClient = null
  }
}

export async function pingRedis(): Promise<boolean> {
  try {
    const pong = await getTestRedis().ping()
    return pong === "PONG"
  } catch {
    return false
  }
}

/** Remove all Bull keys for this app's trading queue (test isolation). */
export async function obliterateTradingQueueKeys() {
  const redis = getTestRedis()
  const pattern = `bull:${TRADING_Q_NAME}*`
  const keys = await redis.keys(pattern)
  if (keys.length > 0) {
    await redis.del(...keys)
  }
}

export function queueNameSuffix() {
  return QID
}
