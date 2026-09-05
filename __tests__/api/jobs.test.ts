import { STRATEGIES } from "../../lib/constants"
import deleteJobHandler from "../../pages/api/delete_job"
import getJobHandler from "../../pages/api/get_job"
import planHandler from "../../pages/api/plan"
import copyHandler from "../../pages/api/plan/copy"
import { invokeApi } from "../support/apiTestClient"
import { createTestPool, deleteTradePlansByIds, describeDb } from "../support/dbHelpers"
import { minimalPlanConfig } from "../support/jobFixtures"
import { createTestUser } from "../support/sessionFactory"

describeDb("/api/plan/copy", () => {
  const pool = createTestPool()
  const ids: string[] = []
  const user = createTestUser()

  afterAll(async () => {
    await pool.query(
      `DELETE FROM trade_plans WHERE day_of_week IN ('WEDNESDAY','THURSDAY','FRIDAY') AND strategy = 'ATM_STRADDLE' AND name = 'Copy source'`
    )
    await deleteTradePlansByIds(pool, ids)
    await pool.end()
  })

  it("returns 401 without session", async () => {
    const result = await invokeApi(copyHandler, {
      method: "POST",
      body: { dayOfWeek: "MONDAY", strategy: STRATEGIES.ATM_STRADDLE },
      user: null,
    })
    expect(result.status).toBe(401)
  })

  it("returns 404 when no source template", async () => {
    const result = await invokeApi(copyHandler, {
      method: "POST",
      user,
      body: { dayOfWeek: "MONDAY", strategy: "NONEXISTENT_STRATEGY" },
    })
    expect([400, 404]).toContain(result.status)
  })

  it("copies Wednesday template to other weekdays", async () => {
    const config = minimalPlanConfig(STRATEGIES.ATM_STRADDLE)
    const created = await invokeApi(planHandler, {
      method: "POST",
      user,
      body: { dayOfWeek: "WEDNESDAY", config: { ...config, name: "Copy source" } },
    })
    const { id } = created.body as { id: string }
    ids.push(id)

    const result = await invokeApi(copyHandler, {
      method: "POST",
      user,
      body: { dayOfWeek: "WEDNESDAY", strategy: STRATEGIES.ATM_STRADDLE, id },
    })
    expect(result.status).toBe(200)
    const body = result.body as { copied: string[]; plans: unknown[] }
    expect(body.copied.length).toBeGreaterThan(0)
    expect(Array.isArray(body.plans)).toBe(true)
  })
})

describe("/api/get_job and /api/delete_job", () => {
  const user = createTestUser()

  it("get_job returns not found for missing id", async () => {
    const result = await invokeApi(getJobHandler, {
      method: "GET",
      query: { id: "nonexistent-job-id-99999" },
      user,
    })
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ error: "job not found" })
  })

  it("get_job returns 401 without session", async () => {
    const result = await invokeApi(getJobHandler, {
      method: "GET",
      query: { id: "x" },
      user: null,
    })
    expect(result.status).toBe(401)
  })

  it("delete_job returns 401 without session", async () => {
    const result = await invokeApi(deleteJobHandler, {
      method: "POST",
      body: { id: "fake" },
      user: null,
    })
    expect(result.status).toBe(401)
  })

  it("delete_job returns 404 for unlinked id", async () => {
    const result = await invokeApi(deleteJobHandler, {
      method: "POST",
      body: { id: "nonexistent-queue-id" },
      user,
    })
    expect(result.status).toBe(404)
  })
})
