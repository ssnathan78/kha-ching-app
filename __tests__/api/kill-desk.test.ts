import { STRATEGIES } from "../../lib/constants"
import killDeskHandler from "../../pages/api/kill-desk"
import strategyDefaultsHandler from "../../pages/api/strategy-defaults"
import { invokeApi } from "../support/apiTestClient"
import { createTestUser } from "../support/sessionFactory"

describe("/api/kill-desk", () => {
  it("returns 401 without session", async () => {
    const result = await invokeApi(killDeskHandler, {
      method: "POST",
      body: { scope: "intraday" },
      user: null,
    })
    expect(result.status).toBe(401)
  })

  it("returns 405 for GET", async () => {
    const result = await invokeApi(killDeskHandler, { method: "GET", user: createTestUser() })
    expect(result.status).toBe(405)
  })

  it("returns 400 for invalid scope", async () => {
    const result = await invokeApi(killDeskHandler, {
      method: "POST",
      user: createTestUser(),
      body: { scope: "invalid" },
    })
    expect(result.status).toBe(400)
  })

  it("POST intraday returns aborted count (mock orders skip kite)", async () => {
    const result = await invokeApi(killDeskHandler, {
      method: "POST",
      user: createTestUser(),
      body: { scope: "intraday" },
    })
    expect(result.status).toBe(200)
    const body = result.body as { scope: string; aborted: number; chasePaused?: boolean }
    expect(body.scope).toBe("intraday")
    expect(typeof body.aborted).toBe("number")
    expect(body.chasePaused).toBeFalsy()
  })

  it("POST all pauses chase", async () => {
    const result = await invokeApi(killDeskHandler, {
      method: "POST",
      user: createTestUser(),
      body: { scope: "all" },
    })
    expect(result.status).toBe(200)
    const body = result.body as { chasePaused: boolean }
    expect(body.chasePaused).toBe(true)
  })
})

describe("/api/strategy-defaults", () => {
  const user = createTestUser()

  it("returns 401 without session", async () => {
    const result = await invokeApi(strategyDefaultsHandler, {
      method: "GET",
      query: { strategy: STRATEGIES.ATM_STRADDLE },
      user: null,
    })
    expect(result.status).toBe(401)
  })

  it("GET returns merged defaults for straddle", async () => {
    const result = await invokeApi(strategyDefaultsHandler, {
      method: "GET",
      query: { strategy: STRATEGIES.ATM_STRADDLE },
      user,
    })
    expect(result.status).toBe(200)
    const body = result.body as { strategy: string; config: { lots?: number } }
    expect(body.strategy).toBe(STRATEGIES.ATM_STRADDLE)
    expect(body.config).toBeTruthy()
  })

  it("returns 400 for Chase strategy", async () => {
    const result = await invokeApi(strategyDefaultsHandler, {
      method: "GET",
      query: { strategy: STRATEGIES.CHASE },
      user,
    })
    expect(result.status).toBe(400)
  })

  it("PUT upserts defaults", async () => {
    const result = await invokeApi(strategyDefaultsHandler, {
      method: "PUT",
      user,
      body: {
        strategy: STRATEGIES.ATM_STRANGLE,
        config: {
          lots: 3,
          isAutoSquareOffEnabled: true,
          exitStrategy: "INDIVIDUAL_LEG_SLM_1X",
          slmPercent: 30,
        },
      },
    })
    expect(result.status).toBe(200)
    expect((result.body as { config: { lots: number } }).config.lots).toBe(3)
  })
})
