import { STRATEGIES } from "../../lib/constants"
import planHandler from "../../pages/api/plan"
import { invokeApi } from "../support/apiTestClient"
import { describeDb } from "../support/dbHelpers"
import { minimalPlanConfig } from "../support/jobFixtures"
import { createTestUser } from "../support/sessionFactory"

describeDb("API negative / concurrency", () => {
  const user = createTestUser()

  it("duplicate plan POST returns 409 on second request", async () => {
    const config = minimalPlanConfig(STRATEGIES.ATM_STRADDLE)
    const day = "SUNDAY"
    await invokeApi(planHandler, { method: "POST", user, body: { dayOfWeek: day, config } })

    const dup = await invokeApi(planHandler, {
      method: "POST",
      user,
      body: { dayOfWeek: day, config: { ...config, name: "dup" } },
    })
    expect(dup.status).toBe(409)
  })

  it("rapid duplicate POST does not corrupt first response shape", async () => {
    const config = minimalPlanConfig(STRATEGIES.ATM_STRANGLE)
    const day = "FRIDAY"
    const [a, b] = await Promise.all([
      invokeApi(planHandler, {
        method: "POST",
        user,
        body: { dayOfWeek: day, config: { ...config, name: "race-a" } },
      }),
      invokeApi(planHandler, {
        method: "POST",
        user,
        body: { dayOfWeek: day, config: { ...config, name: "race-b" } },
      }),
    ])
    const statuses = [a.status, b.status]
    const ok = statuses.filter(s => s === 200).length
    const conflict = statuses.filter(s => s === 409).length
    expect(ok).toBeLessThanOrEqual(1)
    expect(ok + conflict).toBe(2)
  })
})

describe("invalid session on protected API", () => {
  it("returns 401 for plan GET without user", async () => {
    const result = await invokeApi(planHandler, { method: "GET", user: null })
    expect(result.status).toBe(401)
  })
})
