import { Pool } from "pg"

import { JOB_EXECUTION_STATUS, STRATEGIES } from "../../lib/constants"
import { createTestPool, deleteJobExecutionsByTags, describeDb } from "../support/dbHelpers"
import { baseStraddleJob } from "../support/jobFixtures"

describeDb("job_executions lifecycle", () => {
  const pool = createTestPool()
  const tags: string[] = []

  afterAll(async () => {
    await deleteJobExecutionsByTags(pool, tags)
    await pool.end()
  })

  it("inserts PENDING row with order_tag", async () => {
    const job = baseStraddleJob()
    const orderTag = `jest-${Date.now()}`
    tags.push(orderTag)

    const { rows } = await pool.query(
      `INSERT INTO job_executions (strategy, status, order_tag, lots, name, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id, status, order_tag`,
      [STRATEGIES.ATM_STRADDLE, JOB_EXECUTION_STATUS.PENDING, orderTag, job.lots, job.name]
    )
    expect(rows[0].status).toBe(JOB_EXECUTION_STATUS.PENDING)
    expect(rows[0].order_tag).toBe(orderTag)
  })

  it("updates status to QUEUE with queue json", async () => {
    const orderTag = `jest-q-${Date.now()}`
    tags.push(orderTag)
    const { rows } = await pool.query(
      `INSERT INTO job_executions (strategy, status, order_tag, lots, name, created_at)
       VALUES ($1, $2, $3, 1, 'q-test', NOW()) RETURNING id`,
      [STRATEGIES.ATM_STRADDLE, JOB_EXECUTION_STATUS.PENDING, orderTag]
    )
    const id = rows[0].id

    await pool.query(`UPDATE job_executions SET status = $1, queue = $2::jsonb WHERE id = $3`, [
      JOB_EXECUTION_STATUS.QUEUE,
      JSON.stringify({ id: "bull-1", name: "test" }),
      id,
    ])

    const { rows: updated } = await pool.query(
      `SELECT status, queue FROM job_executions WHERE id = $1`,
      [id]
    )
    expect(updated[0].status).toBe(JOB_EXECUTION_STATUS.QUEUE)
    expect(updated[0].queue.id).toBe("bull-1")
  })
})

describeDb("chase_settings single row", () => {
  const pool = createTestPool()

  afterAll(async () => pool.end())

  it("row id=1 exists after migration", async () => {
    const { rows } = await pool.query(`SELECT id, lots FROM chase_settings WHERE id = 1`)
    expect(rows.length).toBe(1)
    expect(rows[0].lots).toBeGreaterThanOrEqual(1)
  })
})

describeDb("strategy_defaults", () => {
  const pool = createTestPool()

  afterAll(async () => pool.end())

  it("has seeded defaults for ATM_STRADDLE", async () => {
    const { rows } = await pool.query(
      `SELECT strategy FROM strategy_defaults WHERE strategy = 'ATM_STRADDLE'`
    )
    expect(rows.length).toBeGreaterThanOrEqual(1)
  })
})

describeDb("concurrent plan uniqueness", () => {
  const pool = createTestPool()

  afterAll(async () => {
    await pool.query(
      `DELETE FROM trade_plans WHERE day_of_week = 'SATURDAY' AND strategy = 'ATM_STRANGLE'`
    )
    await pool.end()
  })

  it("second concurrent insert for same day+strategy fails", async () => {
    const client1 = await pool.connect()
    const client2 = await pool.connect()
    try {
      await client1.query("BEGIN")
      await client2.query("BEGIN")
      await client2.query("SET lock_timeout = '3s'")
      await client1.query(
        `DELETE FROM trade_plans WHERE day_of_week = 'SATURDAY' AND strategy = 'ATM_STRANGLE'`
      )

      await client1.query(
        `INSERT INTO trade_plans (name, strategy, instrument, expiry_type, product_type, day_of_week, exit_strategy, lots, sl_order_type, volatility_type, is_auto_square_off_enabled)
         VALUES ('a','ATM_STRANGLE','NIFTY','CURRENT','MIS','SATURDAY','NO_SL',1,'SLL','SHORT',true)`
      )

      await expect(
        client2.query(
          `INSERT INTO trade_plans (name, strategy, instrument, expiry_type, product_type, day_of_week, exit_strategy, lots, sl_order_type, volatility_type, is_auto_square_off_enabled)
           VALUES ('b','ATM_STRANGLE','NIFTY','CURRENT','MIS','SATURDAY','NO_SL',1,'SLL','SHORT',true)`
        )
      ).rejects.toThrow()

      await client1.query("ROLLBACK")
      await client2.query("ROLLBACK")
    } finally {
      client1.release()
      client2.release()
    }
  }, 15_000)
})
