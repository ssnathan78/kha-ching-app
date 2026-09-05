import { assertAllowedKiteUser } from "../../lib/authPolicy"
import { validateChaseSettings } from "../../lib/chaseValidation"
import { JOB_EXECUTION_STATUS, STRATEGIES, USER_OVERRIDE } from "../../lib/constants"
import { mapJobExecutionInsert } from "../../lib/jobExecutionMapper"
import chaseSettingsHandler from "../../pages/api/chase-settings"
import deleteJobHandler from "../../pages/api/delete_job"
import healthHandler from "../../pages/api/health"
import tradesDayHandler from "../../pages/api/trades_day"
import { invokeApi } from "../support/apiTestClient"
import { createTestPool, deleteJobExecutionsByTags, describeDb } from "../support/dbHelpers"
import { baseStraddleJob } from "../support/jobFixtures"
import { createTestUser } from "../support/sessionFactory"

describe("authPolicy", () => {
  const prevEnv = process.env

  afterEach(() => {
    process.env = { ...prevEnv }
  })

  it("blocks wrong user when ALLOWED_KITE_USER_ID is set", () => {
    process.env.ALLOWED_KITE_USER_ID = "AB1111"
    process.env.NODE_ENV = "development"
    expect(() => assertAllowedKiteUser("XY9999")).toThrow(/not authorized/)
  })

  it("allows matching user", () => {
    process.env.ALLOWED_KITE_USER_ID = "AB1111"
    process.env.NODE_ENV = "development"
    expect(() => assertAllowedKiteUser("AB1111")).not.toThrow()
  })

  it("requires allowlist in production", () => {
    process.env.NODE_ENV = "production"
    delete process.env.ALLOWED_KITE_USER_ID
    expect(() => assertAllowedKiteUser("AB1111")).toThrow(/ALLOWED_KITE_USER_ID/)
  })
})

describe("jobExecutionMapper", () => {
  it("ignores server-controlled fields on insert mapping", () => {
    const mapped = mapJobExecutionInsert({
      name: "Test",
      strategy: STRATEGIES.ATM_STRADDLE,
      status: JOB_EXECUTION_STATUS.COMPLETED,
      userOverride: USER_OVERRIDE.ABORT,
      id: "evil-id",
      orderTag: "evil-tag",
    })
    expect(mapped.status).toBeUndefined()
    expect(mapped.userOverride).toBeUndefined()
    expect(mapped.id).toBeUndefined()
    expect(mapped.orderTag).toBeUndefined()
    expect(mapped.name).toBe("Test")
  })
})

describe("validateChaseSettings", () => {
  it("rejects lots above the configured Chase risk cap", () => {
    const result = validateChaseSettings({ lots: 101 }, { maxLots: 20 })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/cap|20/)
  })
})

describeDb("security API routes", () => {
  const pool = createTestPool()
  const orderTags: string[] = []
  const jobIds: string[] = []
  const user = createTestUser()

  afterAll(async () => {
    if (jobIds.length) {
      await pool.query(`DELETE FROM job_executions WHERE id = ANY($1::text[])`, [jobIds])
    }
    await deleteJobExecutionsByTags(pool, orderTags)
    await pool.end()
  })

  it("POST trades_day ignores mass-assigned status", async () => {
    const job = baseStraddleJob({
      runNow: true,
      name: "Mass assign test",
      status: JOB_EXECUTION_STATUS.COMPLETED,
    } as Record<string, unknown>)
    const result = await invokeApi(tradesDayHandler, {
      method: "POST",
      user,
      body: job,
    })
    expect(result.status).toBe(200)
    const body = result.body as { id: string; orderTag: string }
    jobIds.push(body.id)
    orderTags.push(body.orderTag)

    const { rows } = await pool.query(`SELECT status FROM job_executions WHERE id = $1`, [body.id])
    expect(rows[0]?.status).not.toBe(JOB_EXECUTION_STATUS.COMPLETED)
    expect([
      JOB_EXECUTION_STATUS.PENDING,
      JOB_EXECUTION_STATUS.QUEUE,
      JOB_EXECUTION_STATUS.REJECT,
    ]).toContain(rows[0]?.status)
  })

  it("PUT trades_day rejects direct status mutation", async () => {
    const job = baseStraddleJob({ runNow: true, name: "Status reject" })
    const created = await invokeApi(tradesDayHandler, {
      method: "POST",
      user,
      body: job,
    })
    const { id, orderTag } = created.body as { id: string; orderTag: string }
    jobIds.push(id)
    orderTags.push(orderTag)

    const result = await invokeApi(tradesDayHandler, {
      method: "PUT",
      user,
      body: { id, status: JOB_EXECUTION_STATUS.COMPLETED },
    })
    expect(result.status).toBe(400)
    expect((result.body as { error: string }).error).toContain("status")
  })

  it("PUT trades_day rejects non-ABORT userOverride", async () => {
    const job = baseStraddleJob({ runNow: true, name: "Override reject" })
    const created = await invokeApi(tradesDayHandler, {
      method: "POST",
      user,
      body: job,
    })
    const { id, orderTag } = created.body as { id: string; orderTag: string }
    jobIds.push(id)
    orderTags.push(orderTag)

    const result = await invokeApi(tradesDayHandler, {
      method: "PUT",
      user,
      body: { id, userOverride: "PAUSE" },
    })
    expect(result.status).toBe(400)
    expect((result.body as { error: string }).error).toContain("ABORT")
  })

  it("delete_job returns 404 for unlinked queue id", async () => {
    const result = await invokeApi(deleteJobHandler, {
      method: "POST",
      body: { id: "unlinked-queue-id-99999" },
      user,
    })
    expect(result.status).toBe(404)
  })

  it("chase-settings rejects lots above cap", async () => {
    const result = await invokeApi(chaseSettingsHandler, {
      method: "PUT",
      user,
      body: { config: { lots: 150 } },
    })
    expect(result.status).toBe(400)
    expect((result.body as { error: string }).error).toMatch(/cap|20|lots/i)
  })
})

describe("/api/health token gate", () => {
  const prevToken = process.env.HEALTH_CHECK_TOKEN

  afterEach(() => {
    if (prevToken === undefined) {
      delete process.env.HEALTH_CHECK_TOKEN
    } else {
      process.env.HEALTH_CHECK_TOKEN = prevToken
    }
  })

  it("requires token when HEALTH_CHECK_TOKEN is set", async () => {
    process.env.HEALTH_CHECK_TOKEN = "test-health-secret"
    const denied = await invokeApi(healthHandler, { method: "GET" })
    expect(denied.status).toBe(401)

    const allowed = await invokeApi(healthHandler, {
      method: "GET",
      headers: { authorization: "Bearer test-health-secret" },
    })
    expect(allowed.status).toBe(200)
  })
})
