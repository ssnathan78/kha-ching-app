import dayjs from "dayjs"

import { isStaleTradingJob } from "../../lib/queue-processor/staleJobGuard"

describe("tradingQueue stale job guard", () => {
  it("discards jobs scheduled on a previous calendar day", () => {
    const yesterday = dayjs().subtract(1, "day").valueOf()
    expect(isStaleTradingJob(yesterday)).toBe(true)
  })

  it("accepts jobs scheduled today", () => {
    const today = dayjs().valueOf()
    expect(isStaleTradingJob(today)).toBe(false)
  })

  it("respects delay when computing scheduled day", () => {
    const lateYesterday = dayjs().startOf("day").subtract(1, "hour").valueOf()
    const delay = 2 * 60 * 60 * 1000
    expect(isStaleTradingJob(lateYesterday, delay)).toBe(false)
  })
})

jest.mock("../../lib/jobControl", () => ({
  abortTodaysJobExecutions: jest
    .fn()
    .mockResolvedValue([{ orderTag: "t1", strategy: "ATM_STRADDLE" }]),
}))

jest.mock("../../lib/chaseSettings", () => ({
  saveChaseSettings: jest.fn().mockResolvedValue({ paused: true, lots: 1 }),
}))

jest.mock("../../lib/drizzleDbUtils", () => ({
  getLatestAccessToken: jest.fn(),
  storeAccessToken: jest.fn(),
  updateChaseStatus: jest.fn().mockResolvedValue(undefined),
}))

jest.mock("../../lib/exit-strategies/autoSquareOff", () => ({
  squareOffTag: jest.fn().mockResolvedValue(undefined),
}))

describe("killDesk runDeskKill", () => {
  it("intraday scope does not pause chase", async () => {
    const { runDeskKill } = await import("../../lib/killDesk")
    const { createTestUser } = await import("../support/sessionFactory")
    const result = await runDeskKill("intraday", createTestUser())
    expect(result.scope).toBe("intraday")
    expect(result.chasePaused).toBe(false)
    expect(result.aborted).toBe(1)
  })

  it("all scope pauses chase under mock orders", async () => {
    const { runDeskKill } = await import("../../lib/killDesk")
    const { createTestUser } = await import("../support/sessionFactory")
    const result = await runDeskKill("all", createTestUser())
    expect(result.chasePaused).toBe(true)
  })
})

describe("utils isMockOrder", () => {
  it("returns true in test env", async () => {
    const { isMockOrder } = await import("../../lib/utils")
    expect(isMockOrder()).toBe(true)
  })
})
