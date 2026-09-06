import dayjs from "dayjs"
import tz from "dayjs/plugin/timezone"
import utc from "dayjs/plugin/utc"

dayjs.extend(utc)
dayjs.extend(tz)

jest.mock("../../lib/drizzleDbUtils", () => ({
  getLatestAccessToken: jest.fn(),
  storeAccessToken: jest.fn(),
}))

import { isMarketOpen, round } from "../../lib/utils"

describe("isMarketOpen", () => {
  it("returns false on Sunday", () => {
    const sunday = dayjs.tz("2026-09-06 10:00", "Asia/Kolkata")
    expect(isMarketOpen(sunday)).toBe(false)
  })

  it("returns true on weekday during NSE hours", () => {
    const monday = dayjs.tz("2026-09-07 10:30", "Asia/Kolkata")
    expect(isMarketOpen(monday)).toBe(true)
  })

  it("returns false before market open", () => {
    const early = dayjs.tz("2026-09-07 08:00", "Asia/Kolkata")
    expect(isMarketOpen(early)).toBe(false)
  })

  it("returns false after market close", () => {
    const late = dayjs.tz("2026-09-07 16:00", "Asia/Kolkata")
    expect(isMarketOpen(late)).toBe(false)
  })
})

describe("round", () => {
  it("rounds to specified precision", () => {
    expect(round(1.234, 0.1)).toBeCloseTo(1.2, 5)
  })
})

describe("dashboardJobActions kill scope", () => {
  it("CHASE excluded from intraday kill scope", async () => {
    const { jobMatchesKillScope } = await import("../../lib/dashboardJobActions")
    expect(jobMatchesKillScope("CHASE", "intraday")).toBe(false)
    expect(jobMatchesKillScope("ATM_STRADDLE", "intraday")).toBe(true)
  })
})

describe("remoteRetry", () => {
  it("retries until success", async () => {
    const { withRemoteRetry, ms } = await import("../../lib/remoteRetry")
    let attempts = 0
    const result = await withRemoteRetry(async () => {
      attempts++
      if (attempts < 2) throw new Error("transient")
      return "ok"
    }, ms(5))
    expect(result).toBe("ok")
    expect(attempts).toBe(2)
  })
})

describe("planLabels", () => {
  it("returns safe defaults for missing fields", async () => {
    const { strangleEntryLabel } = await import("../../lib/planLabels")
    expect(strangleEntryLabel({} as any)).toBeTruthy()
  })
})
