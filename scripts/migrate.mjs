import "dotenv/config"
import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import pg from "pg"

const { Pool } = pg
const __dirname = dirname(fileURLToPath(import.meta.url))

/** Same host remap as `__tests__/loadEnv.js` so Windows `yarn migrate` hits Compose. */
const COMPOSE_HOST_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/trading_db"

function hostReachableDatabaseUrl(raw) {
  if (!raw) return raw
  if (existsSync("/.dockerenv")) return raw
  if (raw.includes("@db:") || raw.includes("@postgres:")) return COMPOSE_HOST_DATABASE_URL
  try {
    const parsed = new URL(raw)
    if (parsed.hostname === "db" || parsed.hostname === "postgres") {
      return COMPOSE_HOST_DATABASE_URL
    }
  } catch {
    // keep original
  }
  return raw
}

const url = hostReachableDatabaseUrl(process.env.DATABASE_URL?.trim())
if (!url) {
  console.error("DATABASE_URL is not set")
  process.exit(1)
}

const pool = new Pool({ connectionString: url })
const db = drizzle(pool)

console.log("[migrate] Applying pending migrations...")
await migrate(db, { migrationsFolder: resolve(__dirname, "../drizzle") })
console.log("[migrate] Done")

await pool.end()
