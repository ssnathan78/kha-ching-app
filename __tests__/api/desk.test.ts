import alertsHandler from "../../pages/api/desk/alerts"
import instrumentsHandler from "../../pages/api/desk/instruments"
import ordersHandler from "../../pages/api/desk/orders"
import portfolioHandler from "../../pages/api/desk/portfolio"
import flattenHandler from "../../pages/api/desk/flatten"
import positionsHandler from "../../pages/api/desk/positions"
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
    const positions = await invokeApi(positionsHandler, {
      method: "POST",
      user: null,
      body: { action: "clear-phantom", positionId: "x", confirm: "CLEAR" },
    })
    expect(positions.status).toBe(401)
    const flatten = await invokeApi(flattenHandler, {
      method: "POST",
      user: null,
      body: { all: true },
    })
    expect(flatten.status).toBe(401)
  })

  it("rejects anonymous alerts", async () => {
    const result = await invokeApi(alertsHandler, { method: "GET", user: null })
    expect(result.status).toBe(401)
  })

  it("rejects anonymous instruments", async () => {
    const result = await invokeApi(instrumentsHandler, { method: "GET", user: null })
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
      strategy: "CHASE",
      instrument: "NIFTY",
      kind: "EMA_COMPARE",
      outcome: "WAIT",
      summary: "API filter seed",
      idempotencyKey: key,
    })
    const result = await invokeApi(signalsHandler, {
      method: "GET",
      user,
      query: { strategy: "CHASE" },
    })
    expect(result.status).toBe(200)
    const body = result.body as { signals?: { summary?: string; strategy?: string }[] }
    expect(Array.isArray(body.signals)).toBe(true)
    expect(body.signals?.some(row => row.summary === "API filter seed")).toBe(true)
    expect(body.signals?.every(row => row.strategy === "CHASE")).toBe(true)
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

  it("returns instrument contracts for a logged-in user", async () => {
    const result = await invokeApi(instrumentsHandler, { method: "GET", user })
    expect(result.status).toBe(200)
    const body = result.body as {
      indexes?: { index?: string; frontFut?: unknown }[]
      chase?: { instruments?: string[] }
      cacheNote?: string
    }
    expect(Array.isArray(body.indexes)).toBe(true)
    expect(body.indexes?.some(row => row.index === "NIFTY")).toBe(true)
    expect(body.chase?.instruments?.length).toBeGreaterThan(0)
    expect(body.cacheNote).toMatch(/Kite NFO/)
  })

  it("filters orders by paper vs live book", async () => {
    const { recordOrderIntent } = await import("../../lib/trading/ledger")
    const symbol = `BOOK${Date.now()}`
    await recordOrderIntent({
      side: "SELL",
      tradingsymbol: symbol,
      requestedQty: 65,
      exchange: "NFO",
      product: "NRML",
      orderType: "MARKET",
      purpose: "ENTRY",
      provenance: "PAPER",
      strategy: "CHASE",
    })
    const paper = await invokeApi(ordersHandler, {
      method: "GET",
      user,
      query: { book: "PAPER" },
    })
    const live = await invokeApi(ordersHandler, {
      method: "GET",
      user,
      query: { book: "LIVE" },
    })
    expect(paper.status).toBe(200)
    expect(live.status).toBe(200)
    const paperRows = (paper.body as { orders: { tradingsymbol: string; provenance: string }[] })
      .orders
    const liveRows = (live.body as { orders: { tradingsymbol: string; provenance: string }[] })
      .orders
    expect(paperRows.some(row => row.tradingsymbol === symbol && row.provenance === "PAPER")).toBe(
      true
    )
    expect(liveRows.some(row => row.tradingsymbol === symbol)).toBe(false)
    expect(paperRows.every(row => row.provenance === "PAPER" || row.provenance === "MOCK")).toBe(
      true
    )
    expect(
      liveRows.every(
        row =>
          row.provenance === "LIVE" ||
          row.provenance === "RECONCILED" ||
          row.provenance === "MIGRATED"
      )
    ).toBe(true)
  })

  it("records an order without provenance as PAPER, not LIVE", async () => {
    const { recordOrderIntent } = await import("../../lib/trading/ledger")
    const symbol = `DEF${Date.now()}`
    await recordOrderIntent({
      side: "BUY",
      tradingsymbol: symbol,
      requestedQty: 65,
      exchange: "NFO",
      product: "NRML",
      orderType: "MARKET",
      purpose: "ENTRY",
      strategy: "CHASE",
    })
    const paper = await invokeApi(ordersHandler, {
      method: "GET",
      user,
      query: { book: "PAPER" },
    })
    const live = await invokeApi(ordersHandler, {
      method: "GET",
      user,
      query: { book: "LIVE" },
    })
    const paperRows = (paper.body as { orders: { tradingsymbol: string; provenance: string }[] })
      .orders
    const liveRows = (live.body as { orders: { tradingsymbol: string }[] }).orders
    expect(paperRows.some(row => row.tradingsymbol === symbol && row.provenance === "PAPER")).toBe(
      true
    )
    expect(liveRows.some(row => row.tradingsymbol === symbol)).toBe(false)
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

  it("clears a paper leftover without sending a broker order", async () => {
    const { bookTestFill } = await import("../../lib/trading/ledger")
    const symbol = `PHAN${Date.now()}`
    await bookTestFill({
      tradingsymbol: symbol,
      side: "SELL",
      quantity: 65,
      price: 120,
      strategy: "ATM_STRADDLE",
      provenance: "MOCK",
    })
    const missingConfirm = await invokeApi(positionsHandler, {
      method: "POST",
      user,
      body: { action: "clear-phantom", positionId: "missing", confirm: "nope" },
    })
    expect(missingConfirm.status).toBe(409)

    const rows = await invokeApi(positionsHandler, { method: "GET", user, query: { book: "PAPER" } })
    expect(rows.status).toBe(200)
    const positionId =
      (rows.body as { positions: { id: string; tradingsymbol: string; quantity: number }[] })
        .positions.find(p => p.tradingsymbol === symbol && p.quantity !== 0)?.id ?? ""
    expect(positionId).toBeTruthy()

    const cleared = await invokeApi(positionsHandler, {
      method: "POST",
      user,
      body: { action: "clear-phantom", positionId, confirm: "CLEAR" },
    })
    expect(cleared.status).toBe(200)
    expect((cleared.body as { ok?: boolean }).ok).toBe(true)
  })

  it("squares off an open mock book without halting the desk", async () => {
    const { bookTestFill } = await import("../../lib/trading/ledger")
    const symbol = `FLAT${Date.now()}`
    await bookTestFill({
      tradingsymbol: symbol,
      side: "SELL",
      quantity: 65,
      price: 120,
      strategy: "ATM_STRADDLE",
      provenance: "MOCK",
    })
    const rows = await invokeApi(positionsHandler, { method: "GET", user, query: { book: "PAPER" } })
    const positionId =
      (rows.body as { positions: { id: string; tradingsymbol: string; quantity: number }[] })
        .positions.find(p => p.tradingsymbol === symbol && p.quantity !== 0)?.id ?? ""
    expect(positionId).toBeTruthy()

    const bad = await invokeApi(flattenHandler, {
      method: "POST",
      user,
      body: { all: true, strategy: "CHASE" },
    })
    expect(bad.status).toBe(400)

    const beforeRisk = await invokeApi(riskHandler, { method: "GET", user })
    const haltedBefore = Boolean(
      (beforeRisk.body as { settings?: { deskHalted?: boolean } }).settings?.deskHalted
    )

    const flattened = await invokeApi(flattenHandler, {
      method: "POST",
      user,
      body: { positionId },
    })
    expect(flattened.status).toBe(200)
    expect((flattened.body as { flattened?: unknown[] }).flattened?.length).toBe(1)

    const after = await invokeApi(positionsHandler, { method: "GET", user, query: { book: "PAPER" } })
    const leftover = (
      after.body as { positions: { tradingsymbol: string; quantity: number; status: string }[] }
    ).positions.filter(p => p.tradingsymbol === symbol)
    expect(leftover.filter(p => Number(p.quantity) !== 0)).toEqual([])

    const risk = await invokeApi(riskHandler, { method: "GET", user })
    expect((risk.body as { settings?: { deskHalted?: boolean } }).settings?.deskHalted).toBe(
      haltedBefore
    )
  })

  it("rejects anonymous risk reads", async () => {
    const result = await invokeApi(riskHandler, { method: "GET", user: null })
    expect(result.status).toBe(401)
  })
})
