const fs = require("node:fs")

require("dotenv").config()

process.env.TZ = "Asia/Kolkata"
process.env.MOCK_ORDERS = "true"
process.env.SIMULATION = process.env.SIMULATION || "true"
process.env.SECRET_COOKIE_PASSWORD =
  process.env.SECRET_COOKIE_PASSWORD || "test-secret-cookie-password-min-32-chars"

const insideDocker = fs.existsSync("/.dockerenv")

// Host Jest: map compose service hostnames to published ports.
// In-container Jest: keep postgres/redis — localhost is the test container itself.
const composeDatabaseUrl = insideDocker
  ? "postgresql://postgres:postgres@postgres:5432/trading_db"
  : "postgresql://postgres:postgres@localhost:5432/trading_db"
const composeRedisUrl = insideDocker ? "redis://redis:6379" : "redis://127.0.0.1:6379"
const rawDatabaseUrl = process.env.DATABASE_URL?.trim()
const rawRedisUrl = process.env.REDIS_URL?.trim()

const isDockerInternalDb =
  !insideDocker && (rawDatabaseUrl?.includes("@db:") || rawDatabaseUrl?.includes("@postgres:"))
const isDockerInternalRedis = !insideDocker && rawRedisUrl?.includes("redis://redis:")

process.env.DATABASE_URL = isDockerInternalDb
  ? composeDatabaseUrl
  : rawDatabaseUrl || composeDatabaseUrl
process.env.REDIS_URL = isDockerInternalRedis ? composeRedisUrl : rawRedisUrl || composeRedisUrl

process.env.KITE_API_KEY = process.env.KITE_API_KEY || "test_key"
process.env.KITE_API_SECRET = process.env.KITE_API_SECRET || "test_secret"
