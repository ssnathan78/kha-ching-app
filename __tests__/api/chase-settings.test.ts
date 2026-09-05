import { CHASE_MASTER_DEFAULTS } from "../../lib/chaseDefaults"
import chaseSettingsHandler from "../../pages/api/chase-settings"
import { invokeApi } from "../support/apiTestClient"
import { createTestUser } from "../support/sessionFactory"

describe("/api/chase-settings", () => {
  const user = createTestUser()

  it("returns 401 without session", async () => {
    const result = await invokeApi(chaseSettingsHandler, { method: "GET", user: null })
    expect(result.status).toBe(401)
  })

  it("GET returns chase config", async () => {
    const result = await invokeApi(chaseSettingsHandler, { method: "GET", user })
    expect(result.status).toBe(200)
    const body = result.body as { config: { lots: number; emaPeriod: number } }
    expect(body.config.lots).toBeGreaterThanOrEqual(1)
    expect(body.config.emaPeriod).toBeTruthy()
  })

  it("PUT updates lots and pause flag", async () => {
    const result = await invokeApi(chaseSettingsHandler, {
      method: "PUT",
      user,
      body: { config: { lots: 2, paused: true } },
    })
    expect(result.status).toBe(200)
    const body = result.body as { config: { lots: number; paused: boolean } }
    expect(body.config.lots).toBe(2)
    expect(body.config.paused).toBe(true)
  })

  it("PUT saves selected Chase indexes", async () => {
    const result = await invokeApi(chaseSettingsHandler, {
      method: "PUT",
      user,
      body: { config: { instruments: ["NIFTY", "BANKNIFTY"] } },
    })
    expect(result.status).toBe(200)
    const body = result.body as { config: { instruments: string[] } }
    expect(body.config.instruments).toEqual(["NIFTY", "BANKNIFTY"])
  })

  it("POST reset restores master defaults", async () => {
    await invokeApi(chaseSettingsHandler, {
      method: "PUT",
      user,
      body: { config: { lots: 3 } },
    })
    const result = await invokeApi(chaseSettingsHandler, {
      method: "POST",
      user,
      body: { action: "reset" },
    })
    expect(result.status).toBe(200)
    const body = result.body as { config: typeof CHASE_MASTER_DEFAULTS }
    expect(body.config.lots).toBe(CHASE_MASTER_DEFAULTS.lots)
    expect(body.config.paused).toBe(false)
  })

  it("returns 405 for unsupported method", async () => {
    const result = await invokeApi(chaseSettingsHandler, { method: "DELETE", user })
    expect(result.status).toBe(405)
  })
})
