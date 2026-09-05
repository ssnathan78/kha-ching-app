import { Pool } from "pg"

const databaseUrl = process.env.DATABASE_URL

export const hasDatabase = Boolean(databaseUrl)

export const describeDb = hasDatabase ? describe : describe.skip

export function createTestPool(): Pool {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for integration tests")
  }
  return new Pool({ connectionString: databaseUrl })
}

export async function withTransaction<T>(pool: Pool, fn: (client: Pool) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await fn(client as unknown as Pool)
    await client.query("ROLLBACK")
    return result
  } finally {
    client.release()
  }
}

export async function deleteJobExecutionsByTags(pool: Pool, tags: string[]) {
  if (tags.length === 0) return
  await pool.query(`DELETE FROM job_executions WHERE order_tag = ANY($1::text[])`, [tags])
}

export async function deleteTradePlansByIds(pool: Pool, ids: string[]) {
  if (ids.length === 0) return
  await pool.query(`DELETE FROM trade_plans WHERE id = ANY($1::text[])`, [ids])
}

export async function countJobExecutionsToday(pool: Pool): Promise<number> {
  const { rows } = await pool.query(`
    SELECT COUNT(*)::int AS n FROM job_executions
    WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date
  `)
  return rows[0]?.n ?? 0
}
