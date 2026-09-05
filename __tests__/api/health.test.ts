import healthHandler from "../../pages/api/health"
import { invokeApi } from "../support/apiTestClient"
import { createTestPool, describeDb } from "../support/dbHelpers"

describe("GET /api/health", () => {
  it("returns ok or degraded with checks payload", async () => {
    const result = await invokeApi(healthHandler, { method: "GET" })
    expect([200, 503]).toContain(result.status)
    const body = result.body as { status: string; checks: { postgres: string; redis: string } }
    expect(body.checks).toBeDefined()
    expect(body.checks.postgres).toBeDefined()
    expect(body.checks.redis).toBeDefined()
  })

  describeDb("with database", () => {
    const pool = createTestPool()
    afterAll(async () => {
      await pool.end()
    })

    it("includes service name and timestamp", async () => {
      const result = await invokeApi(healthHandler, { method: "GET" })
      const body = result.body as { service: string; timestamp: string }
      expect(body.service).toBe("kha-ching")
      expect(body.timestamp).toBeTruthy()
    })
  })
})
