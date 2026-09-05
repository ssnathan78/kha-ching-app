require("dotenv").config()

process.env.TZ = "Asia/Kolkata"
process.env.MOCK_ORDERS = "true"
process.env.SIMULATION = process.env.SIMULATION || "true"
process.env.SECRET_COOKIE_PASSWORD =
  process.env.SECRET_COOKIE_PASSWORD || "test-secret-cookie-password-min-32-chars"

// Tests run on the host; map docker-compose service hostnames to published ports.
const composeDatabaseUrl = "postgresql://postgres:postgres@localhost:5432/trading_db"
const composeRedisUrl = "redis://127.0.0.1:6379"
const rawDatabaseUrl = process.env.DATABASE_URL?.trim()
const rawRedisUrl = process.env.REDIS_URL?.trim()

const isDockerInternalDb =
  rawDatabaseUrl?.includes("@db:") || rawDatabaseUrl?.includes("@postgres:")
const isDockerInternalRedis = rawRedisUrl?.includes("redis://redis:")

process.env.DATABASE_URL = isDockerInternalDb
  ? composeDatabaseUrl
  : rawDatabaseUrl || composeDatabaseUrl
process.env.REDIS_URL = isDockerInternalRedis ? composeRedisUrl : rawRedisUrl || composeRedisUrl

process.env.KITE_API_KEY = process.env.KITE_API_KEY || "test_key"
process.env.KITE_API_SECRET = process.env.KITE_API_SECRET || "test_secret"
