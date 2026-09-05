import { STRATEGIES } from "../../lib/constants"
import planHandler from "../../pages/api/plan"
import { invokeApi } from "../support/apiTestClient"
import { createTestPool, deleteTradePlansByIds, describeDb } from "../support/dbHelpers"
import { minimalPlanConfig } from "../support/jobFixtures"
import { createTestUser } from "../support/sessionFactory"

describeDb("POST/GET/PUT/DELETE /api/plan", () => {
  const pool = createTestPool()
  const createdIds: string[] = []

  afterAll(async () => {
    await deleteTradePlansByIds(pool, createdIds)
    await pool.end()
  })

  it("returns 401 without session", async () => {
    const result = await invokeApi(planHandler, { method: "GET", user: null })
    expect(result.status).toBe(401)
  })

  it("GET returns array of plans", async () => {
    const result = await invokeApi(planHandler, { method: "GET", user: createTestUser() })
    expect(result.status).toBe(200)
    expect(Array.isArray(result.body)).toBe(true)
  })

  it("POST creates plan and returns mapped config", async () => {
    const config = minimalPlanConfig(STRATEGIES.ATM_STRADDLE)
    const result = await invokeApi(planHandler, {
      method: "POST",
      user: createTestUser(),
      body: { dayOfWeek: "SATURDAY", config },
    })
    expect(result.status).toBe(200)
    const body = result.body as { id?: string; strategy?: string }
    expect(body.strategy).toBe(STRATEGIES.ATM_STRADDLE)
    if (body.id) createdIds.push(body.id)
  })

  it("POST duplicate weekday+strategy returns 409", async () => {
    const config = minimalPlanConfig(STRATEGIES.ATM_STRADDLE)
    const user = createTestUser()
    const first = await invokeApi(planHandler, {
      method: "POST",
      user,
      body: { dayOfWeek: "SUNDAY", config },
    })
    const body = first.body as { id?: string }
    if (body.id) createdIds.push(body.id)

    const dup = await invokeApi(planHandler, {
      method: "POST",
      user,
      body: { dayOfWeek: "SUNDAY", config },
    })
    expect(dup.status).toBe(409)
  })

  it("PUT updates existing plan", async () => {
    const config = minimalPlanConfig(STRATEGIES.ATM_STRANGLE)
    const user = createTestUser()
    await pool.query(
      `DELETE FROM trade_plans WHERE day_of_week = 'MONDAY' AND strategy = 'ATM_STRANGLE'`
    )
    const created = await invokeApi(planHandler, {
      method: "POST",
      user,
      body: { dayOfWeek: "MONDAY", config: { ...config, name: "Before" } },
    })
    expect(created.status).toBe(200)
    const { id } = created.body as { id: string }
    createdIds.push(id)

    const updated = await invokeApi(planHandler, {
      method: "PUT",
      user,
      body: { dayOfWeek: "MONDAY", config: { ...config, id, name: "After" } },
    })
    expect(updated.status).toBe(200)
    expect((updated.body as { name: string }).name).toBe("After")
  })

  it("PUT missing plan returns 404", async () => {
    const config = minimalPlanConfig(STRATEGIES.ATM_STRADDLE)
    const result = await invokeApi(planHandler, {
      method: "PUT",
      user: createTestUser(),
      body: {
        dayOfWeek: "MONDAY",
        config: { ...config, id: "00000000-0000-0000-0000-000000000000", name: "nope" },
      },
    })
    expect(result.status).toBe(404)
  })

  it("POST rejects invalid lots", async () => {
    const config = { ...minimalPlanConfig(STRATEGIES.ATM_STRADDLE), lots: 0 }
    const result = await invokeApi(planHandler, {
      method: "POST",
      user: createTestUser(),
      body: { dayOfWeek: "WEDNESDAY", config },
    })
    expect(result.status).toBe(400)
    expect((result.body as { error: string }).error).toMatch(/lots/)
  })

  it("PUT rejects unsupported exit strategy", async () => {
    const config = minimalPlanConfig(STRATEGIES.ATM_STRADDLE)
    const user = createTestUser()
    const created = await invokeApi(planHandler, {
      method: "POST",
      user,
      body: { dayOfWeek: "THURSDAY", config },
    })
    const { id } = created.body as { id: string }
    createdIds.push(id)

    const result = await invokeApi(planHandler, {
      method: "PUT",
      user,
      body: {
        dayOfWeek: "THURSDAY",
        config: { ...config, id, exitStrategy: "UNSUPPORTED_EXIT" },
      },
    })
    expect(result.status).toBe(400)
    expect((result.body as { error: string }).error).toMatch(/not implemented/)
  })

  it("DELETE removes plan", async () => {
    const config = minimalPlanConfig(STRATEGIES.ATM_STRADDLE)
    const user = createTestUser()
    const created = await invokeApi(planHandler, {
      method: "POST",
      user,
      body: { dayOfWeek: "TUESDAY", config: { ...config, name: "ToDelete" } },
    })
    const { id } = created.body as { id: string }

    const deleted = await invokeApi(planHandler, {
      method: "DELETE",
      user,
      body: { config: { id } },
    })
    expect(deleted.status).toBe(200)
    expect((deleted.body as { success: boolean }).success).toBe(true)
  })
})
