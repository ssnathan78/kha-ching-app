import ordersHandler from "../../pages/api/desk/orders"
import portfolioHandler from "../../pages/api/desk/portfolio"
import reconcileHandler from "../../pages/api/desk/reconcile"
import riskHandler from "../../pages/api/desk/risk"
import { invokeApi } from "../support/apiTestClient"
import { describeDb } from "../support/dbHelpers"
import { createTestUser } from "../support/sessionFactory"

describe("desk API auth", () => {
  it("rejects anonymous portfolio and reconcile", async () => {
    const portfolio = await invokeApi(portfolioHandler, { method: "GET", user: null })
    expect(portfolio.status).toBe(401)
    const recon = await invokeApi(reconcileHandler, { method: "POST", user: null })
    expect(recon.status).toBe(401)
  })

  it("rejects GET on reconcile", async () => {
    const result = await invokeApi(reconcileHandler, { method: "GET", user: createTestUser() })
    expect(result.status).toBe(405)
  })
})

describeDb("desk API session", () => {
  const user = createTestUser()

  it("returns portfolio payload for a logged-in user", async () => {
    const result = await invokeApi(portfolioHandler, { method: "GET", user })
    expect(result.status).toBe(200)
    const body = result.body as { portfolio?: { sessionDate?: string } }
    expect(body.portfolio?.sessionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("returns orders list", async () => {
    const result = await invokeApi(ordersHandler, { method: "GET", user })
    expect(result.status).toBe(200)
    expect(Array.isArray((result.body as { orders?: unknown[] }).orders)).toBe(true)
  })

  it("returns risk settings and persists a halt/resume", async () => {
    const get = await invokeApi(riskHandler, { method: "GET", user })
    expect(get.status).toBe(200)
    expect(
      (get.body as { settings?: { strategies?: { ATM_STRADDLE?: { maxLots?: number } } } }).settings
        ?.strategies?.ATM_STRADDLE?.maxLots
    ).toBeGreaterThan(0)

    const halted = await invokeApi(riskHandler, {
      method: "POST",
      user,
      body: { action: "halt", reason: "api test halt" },
    })
    expect(halted.status).toBe(200)
    expect((halted.body as { settings?: { deskHalted?: boolean } }).settings?.deskHalted).toBe(true)

    const resumed = await invokeApi(riskHandler, {
      method: "POST",
      user,
      body: { action: "resume" },
    })
    expect(resumed.status).toBe(200)
    expect((resumed.body as { settings?: { deskHalted?: boolean } }).settings?.deskHalted).toBe(
      false
    )
  })

  it("rejects anonymous risk reads", async () => {
    const result = await invokeApi(riskHandler, { method: "GET", user: null })
    expect(result.status).toBe(401)
  })
})
