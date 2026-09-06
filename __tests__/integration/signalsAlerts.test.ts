import { listOperatorAlerts, recordOperatorAlert } from "../../lib/trading/alerts"
import {
  deleteSignalsForPeriod,
  listStrategySignals,
  recordFeedClear,
  recordStrategySignal,
} from "../../lib/trading/signals"
import { createTestPool, describeDb } from "../support/dbHelpers"

describeDb("strategy signals and alert clears", () => {
  const pool = createTestPool()
  const keys: string[] = []

  afterAll(async () => {
    if (keys.length) {
      await pool.query(`DELETE FROM strategy_signals WHERE idempotency_key = ANY($1::text[])`, [
        keys,
      ])
    }
    await pool.end()
  })

  it("persists a signal and returns it from list + strategy filter", async () => {
    const key = `int-signal:${Date.now()}`
    keys.push(key)
    await recordStrategySignal({
      strategy: "ATM_STRADDLE",
      instrument: "NIFTY",
      planRef: "plan-int",
      kind: "SKEW_SAMPLE",
      outcome: "WAIT",
      summary: "Integration seed wait",
      idempotencyKey: key,
    })

    const all = await listStrategySignals({ period: "all" })
    expect(all.signals.some(row => row.summary === "Integration seed wait")).toBe(true)
    expect(all.filters.strategies).toContain("ATM_STRADDLE")

    const filtered = await listStrategySignals({ period: "all", strategy: "ATM_STRADDLE" })
    expect(filtered.signals.every(row => row.strategy === "ATM_STRADDLE")).toBe(true)
    expect(filtered.signals.some(row => row.idempotencyKey === undefined || row.summary)).toBe(true)
  })

  it("records an operator alert that listOperatorAlerts can see", async () => {
    await recordOperatorAlert({
      source: "SCHEDULE",
      code: "MARKET_CLOSED",
      severity: "ERROR",
      summary: "Integration schedule reject",
      strategy: "ATM_STRADDLE",
      instrument: "NIFTY",
      idempotencyKey: `int-alert:${Date.now()}`,
    })
    const listed = await listOperatorAlerts(80, "all")
    expect(listed.alerts.some(row => row.summary === "Integration schedule reject")).toBe(true)
    expect(listed.errorCount).toBeGreaterThan(0)
  })

  it("DELETE today removes today's signals and leaves yesterday", async () => {
    const todayKey = `int-sig-today:${Date.now()}`
    const ydayKey = `int-sig-yday:${Date.now()}`
    keys.push(todayKey, ydayKey)
    await recordStrategySignal({
      strategy: "CHASE",
      kind: "EMA_COMPARE",
      outcome: "WAIT",
      summary: "Today signal",
      idempotencyKey: todayKey,
    })
    const yesterday = new Date(Date.now() - 36 * 60 * 60 * 1000)
    await recordStrategySignal({
      strategy: "CHASE",
      kind: "EMA_COMPARE",
      outcome: "HOLD",
      summary: "Yesterday signal",
      idempotencyKey: ydayKey,
      occurredAt: yesterday,
    })

    await deleteSignalsForPeriod("today")
    const after = await listStrategySignals({ period: "all", strategy: "CHASE" })
    expect(after.signals.some(row => row.summary === "Today signal")).toBe(false)
    expect(after.signals.some(row => row.summary === "Yesterday signal")).toBe(true)
  })

  it("before_today delete does not remove today's signals", async () => {
    const todayKey = `int-sig-keep-today:${Date.now()}`
    keys.push(todayKey)
    await recordStrategySignal({
      strategy: "ATM_STRANGLE",
      kind: "STRIKE_SELECT",
      outcome: "ENTER",
      summary: "Keep today",
      idempotencyKey: todayKey,
    })
    await deleteSignalsForPeriod("before_today")
    const listed = await listStrategySignals({ period: "today", strategy: "ATM_STRANGLE" })
    expect(listed.signals.some(row => row.summary === "Keep today")).toBe(true)
  })

  it("alert clear today hides old rows but a later alert still appears", async () => {
    await recordOperatorAlert({
      source: "JOB",
      code: "JOB_FAILED",
      severity: "ERROR",
      summary: "Before clear",
      idempotencyKey: `int-alert-before:${Date.now()}`,
    })
    await recordFeedClear("alerts", "today")
    const hidden = await listOperatorAlerts(80, "today")
    expect(hidden.alerts.some(row => row.summary === "Before clear")).toBe(false)

    await new Promise(resolve => setTimeout(resolve, 20))
    await recordOperatorAlert({
      source: "JOB",
      code: "JOB_FAILED",
      severity: "ERROR",
      summary: "After clear",
      idempotencyKey: `int-alert-after:${Date.now()}`,
    })
    const visible = await listOperatorAlerts(80, "today")
    expect(visible.alerts.some(row => row.summary === "After clear")).toBe(true)
  })

  it("alert clear does not delete audit_events", async () => {
    const { rows: before } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_events WHERE summary = 'Before clear'`
    )
    await recordFeedClear("alerts", "all")
    const { rows: after } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_events WHERE summary = 'Before clear'`
    )
    expect(after[0].n).toBe(before[0].n)
  })
})
