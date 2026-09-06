import {
  alertDedupeKey,
  alertFromFailedOrder,
  alertFromRejectedJob,
  countAlertSeverities,
  isOperatorAlertEvent,
  liveScheduleRejectReason,
  mergeOperatorAlerts,
  type OperatorAlert,
  scheduleRejectCode,
} from "../../../lib/trading/alerts"

function alert(overrides: Partial<OperatorAlert> = {}): OperatorAlert {
  return {
    id: "a1",
    occurredAt: "2026-09-06T03:00:00.000Z",
    severity: "ERROR",
    source: "SCHEDULE",
    code: "MARKET_CLOSED",
    summary: "Exchange is offline right now.",
    jobId: "job-1",
    ...overrides,
  }
}

describe("liveScheduleRejectReason", () => {
  it("allows mock punches when the exchange is closed", () => {
    expect(
      liveScheduleRejectReason({
        isMock: true,
        runNow: true,
        marketOpenNow: false,
        marketOpenAtRunAt: false,
      })
    ).toBeNull()
  })

  it("rejects live run-now when the session is closed", () => {
    expect(
      liveScheduleRejectReason({
        isMock: false,
        runNow: true,
        marketOpenNow: false,
        marketOpenAtRunAt: false,
      })
    ).toEqual({
      code: "MARKET_CLOSED",
      message: "Exchange is offline right now.",
    })
  })

  it("rejects a live schedule whose runAt is outside session", () => {
    expect(
      liveScheduleRejectReason({
        isMock: false,
        runNow: false,
        runAt: "2026-09-06T09:20:00+05:30",
        marketOpenNow: false,
        marketOpenAtRunAt: false,
      })
    ).toEqual({
      code: "SCHEDULE_MARKET_CLOSED",
      message: "Exchange would be offline at the scheduled time.",
    })
  })

  it("allows live run-now in session", () => {
    expect(
      liveScheduleRejectReason({
        isMock: false,
        runNow: true,
        marketOpenNow: true,
        marketOpenAtRunAt: true,
      })
    ).toBeNull()
  })
})

describe("schedule and merge helpers", () => {
  it("maps offline messages to codes", () => {
    expect(scheduleRejectCode("Exchange is offline right now.")).toBe("MARKET_CLOSED")
    expect(scheduleRejectCode("Exchange would be offline at the scheduled time.")).toBe(
      "SCHEDULE_MARKET_CLOSED"
    )
    expect(scheduleRejectCode("Failed to enqueue job")).toBe("ENQUEUE_FAILED")
  })

  it("treats job/risk/broker events as operator alerts", () => {
    expect(isOperatorAlertEvent("JOB_REJECTED", "INFO")).toBe(true)
    expect(isOperatorAlertEvent("SIGNAL_GENERATED", "INFO")).toBe(false)
    expect(isOperatorAlertEvent("SIGNAL_GENERATED", "ERROR")).toBe(true)
  })

  it("builds a schedule reject from a job row", () => {
    const row = alertFromRejectedJob({
      id: "job-9",
      createdAt: new Date("2026-09-06T03:10:00.000Z"),
      status: "REJECT",
      strategy: "ATM_STRADDLE",
      instrument: "NIFTY",
      queue: { error: "Exchange is offline right now." },
    })
    expect(row.source).toBe("SCHEDULE")
    expect(row.code).toBe("MARKET_CLOSED")
    expect(row.summary).toContain("offline")
  })

  it("builds an order failure from the blotter", () => {
    const row = alertFromFailedOrder({
      id: "ord-1",
      createdAt: new Date("2026-09-05T10:00:00.000Z"),
      status: "FAILED",
      strategy: "ATM_STRANGLE",
      tradingsymbol: "NIFTY25SEP25000CE",
      rejectReason: null,
      errorInfo: "InputException",
    })
    expect(row.source).toBe("ORDER")
    expect(row.summary).toBe("InputException")
  })

  it("dedupes the same job+code from audit and job synthesis", () => {
    const merged = mergeOperatorAlerts([
      alert({ id: "audit:1", occurredAt: "2026-09-06T03:11:00.000Z" }),
      alert({ id: "job:job-1:REJECT", occurredAt: "2026-09-06T03:10:00.000Z" }),
      alert({
        id: "audit:2",
        jobId: "job-2",
        code: "JOB_FAILED",
        occurredAt: "2026-09-06T02:00:00.000Z",
      }),
    ])
    expect(merged).toHaveLength(2)
    expect(merged[0].id).toBe("audit:1")
    expect(alertDedupeKey(merged[0])).toBe("job:job-1:MARKET_CLOSED")
  })

  it("counts severities on the visible page", () => {
    expect(
      countAlertSeverities([
        alert(),
        alert({ id: "w", severity: "WARN", jobId: "job-w", code: "CHASE_NO_FUT" }),
      ])
    ).toEqual({ errorCount: 1, warnCount: 1 })
  })
})
