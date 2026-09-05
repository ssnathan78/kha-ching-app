import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as schema from "./schema"

const rawDatabaseUrl = process.env.DATABASE_URL?.trim()

if (!rawDatabaseUrl) {
  throw new Error("DATABASE_URL environment variable is required")
}

export const pool = new Pool({
  connectionString: rawDatabaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  options: "-c idle_in_transaction_session_timeout=300000",
})

export const db = drizzle(pool, { schema })

export { schema }
