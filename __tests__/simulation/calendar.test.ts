import dayjs from "dayjs"
import timezone from "dayjs/plugin/timezone"
import utc from "dayjs/plugin/utc"

import {
  isNonTradingDay,
  isSessionOpen,
  marketSessionState,
  nextSessionOpen,
} from "../../lib/marketCalendar"

dayjs.extend(utc)
dayjs.extend(timezone)

const ist = (s: string) => dayjs.tz(s, "Asia/Kolkata")

describe("market calendar", () => {
  it("treats a normal weekday session as OPEN only after 09:15 and before 15:30", () => {
    expect(isSessionOpen(ist("2026-09-07 09:15"))).toBe(false)
    expect(isSessionOpen(ist("2026-09-07 09:15:01"))).toBe(true)
    expect(isSessionOpen(ist("2026-09-07 12:00"))).toBe(true)
    expect(isSessionOpen(ist("2026-09-07 15:30"))).toBe(false)
  })

  it("Friday → weekend → Monday", () => {
    expect(marketSessionState(ist("2026-09-04 12:00"))).toBe("OPEN")
    expect(marketSessionState(ist("2026-09-05 12:00"))).toBe("WEEKEND")
    expect(marketSessionState(ist("2026-09-06 12:00"))).toBe("WEEKEND")
    expect(nextSessionOpen(ist("2026-09-04 16:00")).format("YYYY-MM-DD HH:mm")).toBe(
      "2026-09-07 09:15"
    )
  })

  it("Republic Day 2026 is a holiday", () => {
    expect(isNonTradingDay(ist("2026-01-26"))).toBe(true)
    expect(isSessionOpen(ist("2026-01-26 10:30"))).toBe(false)
    expect(marketSessionState(ist("2026-01-26 10:30"))).toBe("HOLIDAY")
  })

  it("holiday adjacent to a weekend (Gandhi Jayanti 2026-10-02 Friday)", () => {
    expect(isNonTradingDay(ist("2026-10-02"))).toBe(true)
    expect(isNonTradingDay(ist("2026-10-03"))).toBe(true)
    expect(nextSessionOpen(ist("2026-10-02 08:00")).format("YYYY-MM-DD")).toBe("2026-10-05")
  })

  it("supports an early close override", () => {
    const overrides = { earlyCloses: { "2026-09-07": "13:00" } }
    expect(isSessionOpen(ist("2026-09-07 12:30"), [], overrides)).toBe(true)
    expect(isSessionOpen(ist("2026-09-07 13:00"), [], overrides)).toBe(false)
  })

  it("supports an unexpected closure", () => {
    const overrides = { closedDates: ["2026-09-07"] }
    expect(isSessionOpen(ist("2026-09-07 10:30"), [], overrides)).toBe(false)
    expect(marketSessionState(ist("2026-09-07 10:30"), [], overrides)).toBe("HOLIDAY")
  })

  it("labels pre-market, post-market, and overnight", () => {
    expect(marketSessionState(ist("2026-09-07 09:05"))).toBe("PRE_MARKET")
    expect(marketSessionState(ist("2026-09-07 15:40"))).toBe("POST_MARKET")
    expect(marketSessionState(ist("2026-09-07 22:00"))).toBe("OVERNIGHT")
  })

  it("forced HALTED overrides the calendar", () => {
    expect(marketSessionState(ist("2026-09-07 10:30"), [], {}, "HALTED")).toBe("HALTED")
  })
})
