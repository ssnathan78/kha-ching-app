import dayjs from "dayjs"
import timezone from "dayjs/plugin/timezone"
import utc from "dayjs/plugin/utc"

import { isSessionOpen, marketSessionState, nextSessionOpen } from "../../lib/marketCalendar"
import { simulate } from "../../lib/simulation/runner"

dayjs.extend(utc)
dayjs.extend(timezone)

const ist = (s: string) => dayjs.tz(s, "Asia/Kolkata")

describe("time boundaries", () => {
  it("midnight is not a trading session", () => {
    expect(isSessionOpen(ist("2026-09-07 00:00"))).toBe(false)
    expect(marketSessionState(ist("2026-09-07 00:00"))).toBe("OVERNIGHT")
  })

  it("day boundary Friday 23:59 → Saturday 00:00 stays closed", () => {
    expect(isSessionOpen(ist("2026-09-04 23:59"))).toBe(false)
    expect(marketSessionState(ist("2026-09-05 00:00"))).toBe("WEEKEND")
  })

  it("month and year boundaries do not invent a session", () => {
    expect(isSessionOpen(ist("2026-08-31 23:59"))).toBe(false)
    expect(isSessionOpen(ist("2026-09-01 00:00"))).toBe(false)
    expect(isSessionOpen(ist("2025-12-31 15:00"))).toBe(true)
    expect(isSessionOpen(ist("2026-01-01 10:00"))).toBe(true)
  })

  it("session open/close exclusive bounds", () => {
    expect(isSessionOpen(ist("2026-09-07 09:15:00"))).toBe(false)
    expect(isSessionOpen(ist("2026-09-07 09:15:01"))).toBe(true)
    expect(isSessionOpen(ist("2026-09-07 15:29:59"))).toBe(true)
    expect(isSessionOpen(ist("2026-09-07 15:30:00"))).toBe(false)
  })

  it("next session after year-end holiday week lands on a weekday", () => {
    const next = nextSessionOpen(ist("2026-12-25 12:00"))
    expect(next.day()).not.toBe(0)
    expect(next.day()).not.toBe(6)
    expect(next.format("HH:mm")).toBe("09:15")
  })

  it("a run that crosses midnight does not treat the night as a trading day", () => {
    const result = simulate({
      scenario: "overnight",
      start: "2026-09-07 15:45",
      end: "2026-09-08 08:30",
      stepMinutes: 30,
      seed: 1,
      paperRisk: false,
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: "NIFTY26SEPFUT",
          lots: 1,
          fireAt: "16:00",
        },
      ],
    })
    expect(result.orders.filter(o => o.status !== "REJECTED").length).toBe(0)
  })
})
