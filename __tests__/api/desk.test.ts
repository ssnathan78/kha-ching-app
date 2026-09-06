import alertsHandler from "../../pages/api/desk/alerts"
import ordersHandler from "../../pages/api/desk/orders"
import portfolioHandler from "../../pages/api/desk/portfolio"
import reconcileHandler from "../../pages/api/desk/reconcile"
import riskHandler from "../../pages/api/desk/risk"
import signalsHandler from "../../pages/api/desk/signals"
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

  it("rejects anonymous alerts", async () => {
    const result = await invokeApi(alertsHandler, { method: "GET", user: null })
    expect(result.status).toBe(401)
  })

  it("rejects anonymous signals", async () => {
    const result = await invokeApi(signalsHandler, { method: "GET", user: null })
    expect(result.status).toBe(401)
  })

  it("rejects anonymous DELETE on signals and alerts", async () => {
    const signals = await invokeApi(signalsHandler, {
      method: "DELETE",
      user: null,
      body: { period: "today" },
    })
    expect(signals.status).toBe(401)
    const alerts = await invokeApi(alertsHandler, {
      method: "DELETE",
      user: null,
      body: { period: "today" },
    })
    expect(alerts.status).toBe(401)
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

  it("returns signals list", async () => {
    const result = await invokeApi(signalsHandler, { method: "GET", user })
    expect(result.status).toBe(200)
    const body = result.body as { signals?: unknown[]; filters?: { strategies?: unknown[] } }
    expect(Array.isArray(body.signals)).toBe(true)
    expect(Array.isArray(body.filters?.strategies)).toBe(true)
  })

  it("clears signals and alerts for a period", async () => {
    const signals = await invokeApi(signalsHandler, {
      method: "DELETE",
      user,
      body: { period: "today" },
    })
    expect(signals.status).toBe(200)
    expect((signals.body as { ok?: boolean }).ok).toBe(true)

    const alerts = await invokeApi(alertsHandler, {
      method: "DELETE",
      user,
      body: { period: "today" },
    })
    expect(alerts.status).toBe(200)
    expect((alerts.body as { ok?: boolean }).ok).toBe(true)
  })

  it("rejects an invalid signals clear period", async () => {
    const result = await invokeApi(signalsHandler, {
      method: "DELETE",
      user,
      body: { period: "yesterday" },
    })
    expect(result.status).toBe(400)
  })

  it("rejects an invalid alerts clear period", async () => {
    const result = await invokeApi(alertsHandler, {
      method: "DELETE",
      user,
      body: { period: "yesterday" },
    })
    expect(result.status).toBe(400)
  })

  it("filters signals by strategy after a row is recorded", async () => {
    const { recordStrategySignal } = await import("../../lib/trading/signals")
    const key = `api-desk-filter:${Date.now()}`
    await recordStrategySignal({
      strategy: "SUBSCRIBE_CHASE",
      instrument: "NIFTY",
      kind: "EMA_COMPARE",
      outcome: "WAIT",
      summary: "API filter seed",
      idempotencyKey: key,
    })
    const result = await invokeApi(signalsHandler, {
      method: "GET",
      user,
      query: { strategy: "SUBSCRIBE_CHASE" },
    })
    expect(result.status).toBe(200)
    const body = result.body as { signals?: { summary?: string; strategy?: string }[] }
    expect(Array.isArray(body.signals)).toBe(true)
    expect(body.signals?.some(row => row.summary === "API filter seed")).toBe(true)
    expect(body.signals?.every(row => row.strategy === "SUBSCRIBE_CHASE")).toBe(true)
  })

  it("returns today's alerts when period=today", async () => {
    const { recordOperatorAlert } = await import("../../lib/trading/alerts")
    await recordOperatorAlert({
      source: "SCHEDULE",
      code: "MARKET_CLOSED",
      severity: "ERROR",
      summary: "Desk period=today seed",
      idempotencyKey: `desk-alert-today:${Date.now()}`,
    })
    const result = await invokeApi(alertsHandler, {
      method: "GET",
      user,
      query: { period: "today" },
    })
    expect(result.status).toBe(200)
    const body = result.body as { alerts?: { summary?: string }[] }
    expect(body.alerts?.some(row => row.summary === "Desk period=today seed")).toBe(true)
  })

  it("returns alerts list", async () => {
    const result = await invokeApi(alertsHandler, { method: "GET", user })
    expect(result.status).toBe(200)
    const body = result.body as { alerts?: unknown[]; errorCount?: number; warnCount?: number }
    expect(Array.isArray(body.alerts)).toBe(true)
    expect(typeof body.errorCount).toBe("number")
    expect(typeof body.warnCount).toBe("number")
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
