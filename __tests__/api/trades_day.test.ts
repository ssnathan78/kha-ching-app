import { USER_OVERRIDE } from "../../lib/constants"
import tradesDayHandler from "../../pages/api/trades_day"
import { invokeApi } from "../support/apiTestClient"
import { createTestPool, deleteJobExecutionsByTags, describeDb } from "../support/dbHelpers"
import { baseStraddleJob } from "../support/jobFixtures"
import { createTestUser } from "../support/sessionFactory"

describeDb("/api/trades_day", () => {
  const pool = createTestPool()
  const orderTags: string[] = []
  const jobIds: string[] = []

  afterAll(async () => {
    if (jobIds.length) {
      await pool.query(`DELETE FROM job_executions WHERE id = ANY($1::text[])`, [jobIds])
    }
    await deleteJobExecutionsByTags(pool, orderTags)
    await pool.end()
  })

  const user = createTestUser()

  it("returns 401 without session", async () => {
    const result = await invokeApi(tradesDayHandler, { method: "GET", user: null })
    expect(result.status).toBe(401)
  })

  it("GET returns today's jobs array", async () => {
    const result = await invokeApi(tradesDayHandler, { method: "GET", user })
    expect(result.status).toBe(200)
    expect(Array.isArray(result.body)).toBe(true)
  })

  it("POST rejects unimplemented exit strategy", async () => {
    const job = baseStraddleJob({
      exitStrategy: "MULTI_LEG_PREMIUM_THRESHOLD" as any,
      runNow: true,
    })
    const result = await invokeApi(tradesDayHandler, {
      method: "POST",
      user,
      body: job,
    })
    expect(result.status).toBe(400)
    expect((result.body as { error: string }).error).toContain("not implemented")
  })

  it("POST rejects strangle on FINNIFTY", async () => {
    const { baseStrangleJob } = await import("../support/jobFixtures")
    const result = await invokeApi(tradesDayHandler, {
      method: "POST",
      user,
      body: baseStrangleJob({ instrument: "FINNIFTY" as any, runNow: true }),
    })
    expect(result.status).toBe(400)
  })

  it("POST creates job execution and enqueues (mock)", async () => {
    const job = baseStraddleJob({ runNow: true, name: "API test straddle" })
    const result = await invokeApi(tradesDayHandler, {
      method: "POST",
      user,
      body: job,
    })
    expect(result.status).toBe(200)
    const body = result.body as { id?: string; orderTag?: string; status?: string }
    expect(body.id).toBeTruthy()
    expect(body.orderTag).toBeTruthy()
    if (body.id) jobIds.push(body.id)
    if (body.orderTag) orderTags.push(body.orderTag)
    expect(["PENDING", "QUEUE", "REJECT"]).toContain(body.status)
  })

  it("PUT with ABORT sets userOverride", async () => {
    const job = baseStraddleJob({ runNow: true, name: "Abort test" })
    const created = await invokeApi(tradesDayHandler, {
      method: "POST",
      user,
      body: job,
    })
    const { id } = created.body as { id: string; orderTag: string }
    jobIds.push(id)

    const aborted = await invokeApi(tradesDayHandler, {
      method: "PUT",
      user,
      body: { id, userOverride: USER_OVERRIDE.ABORT },
    })
    expect(aborted.status).toBe(200)

    const { rows } = await pool.query(`SELECT user_override FROM job_executions WHERE id = $1`, [
      id,
    ])
    expect(rows[0]?.user_override).toBe(USER_OVERRIDE.ABORT)
  })

  it("PUT without id returns 400", async () => {
    const result = await invokeApi(tradesDayHandler, {
      method: "PUT",
      user,
      body: { userOverride: USER_OVERRIDE.ABORT },
    })
    expect(result.status).toBe(400)
  })

  it("DELETE removes job row", async () => {
    const job = baseStraddleJob({ runNow: true, name: "Delete test" })
    const created = await invokeApi(tradesDayHandler, {
      method: "POST",
      user,
      body: job,
    })
    const { id, orderTag } = created.body as { id: string; orderTag: string }

    const deleted = await invokeApi(tradesDayHandler, {
      method: "DELETE",
      user,
      body: { id },
    })
    expect(deleted.status).toBe(200)

    const { rows } = await pool.query(`SELECT id FROM job_executions WHERE id = $1`, [id])
    expect(rows.length).toBe(0)
    orderTags.push(orderTag)
  })

  it("returns 400 for unsupported method", async () => {
    const result = await invokeApi(tradesDayHandler, { method: "PATCH", user })
    expect(result.status).toBe(400)
  })
})
