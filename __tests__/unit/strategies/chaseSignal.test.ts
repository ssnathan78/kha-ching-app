import dayjs from "dayjs"
import tz from "dayjs/plugin/timezone"
import utc from "dayjs/plugin/utc"

dayjs.extend(utc)
dayjs.extend(tz)

import { chaseAllowsNewEntry, chaseTolerances } from "../../../lib/chaseDefaults"
import { getAcceptedPrevEma } from "../../../lib/chaseSignal"
import { CHASE_STATUS } from "../../../lib/constants"

jest.mock("../../../lib/kiteUtils", () => ({
  getPreviousTradingDay: jest.fn().mockResolvedValue("2026-09-04"),
  placeKiteOrder: jest.fn(),
  getKiteInstance: jest.fn(),
  cancelOrder: jest.fn(),
  placeSL: jest.fn(),
}))

jest.mock("../../../lib/drizzleDbUtils", () => ({
  getChaseStatus: jest.fn(),
  updateChaseStatus: jest.fn().mockResolvedValue({ success: true }),
  getChaseJob: jest.fn().mockResolvedValue({ lots: 1 }),
}))

jest.mock("../../../lib/chaseSettings", () => ({
  getChaseSettings: jest.fn().mockResolvedValue({ lots: 1, paused: false }),
  getChaseEngineConfig: jest.fn().mockResolvedValue({ bufferPercent: 0.2, entryLimitOffset: 5 }),
}))

jest.mock("../../../lib/utils", () => ({
  toIst: (d: dayjs.Dayjs) => d,
  postToSlack: jest.fn(),
}))

describe("chaseTolerances trader bands", () => {
  it("0.2% buffer on 10000 EMA", () => {
    const { longTolerance, shortTolerance } = chaseTolerances(10000, 0.2)
    expect(longTolerance).toBeCloseTo(10020, 4)
    expect(shortTolerance).toBeCloseTo(9980, 4)
  })

  it("wider buffer increases long tolerance (more conservative entry)", () => {
    const tight = chaseTolerances(10000, 0.2)
    const wide = chaseTolerances(10000, 1)
    expect(wide.longTolerance).toBeGreaterThan(tight.longTolerance)
  })
})

describe("chase pause protects new entries", () => {
  it("blocks new entries when paused", () => {
    expect(chaseAllowsNewEntry(true)).toBe(false)
  })
})

describe("getAcceptedPrevEma", () => {
  it("returns null before cutoff without prior row", async () => {
    expect(
      await getAcceptedPrevEma(null, dayjs.tz("2026-09-05 09:00", "Asia/Kolkata"), "tok")
    ).toBeNull()
  })
})

describe("generateSignal pause cancels pending", () => {
  it("cancels pending entry orders when paused in awaiting state", async () => {
    const { getChaseStatus, updateChaseStatus } = require("../../../lib/drizzleDbUtils")
    const { cancelOrder } = require("../../../lib/kiteUtils")
    getChaseStatus.mockResolvedValue({
      status: CHASE_STATUS.AWAITING_LONG,
      tradingsymbol: "NIFTY25SEPFUT",
    })
    const { getChaseSettings } = require("../../../lib/chaseSettings")
    getChaseSettings.mockResolvedValue({ lots: 1, paused: true })

    const { generateSignal } = await import("../../../lib/chaseSignal")
    await generateSignal(
      [
        {
          tradingsymbol: "NIFTY25SEPFUT",
          instrumentToken: 1,
          ema: 25000,
          highestHigh: 25100,
          lowestLow: 24900,
          lastClose: 25050,
          lotSize: 65,
        },
      ],
      "2026-09-05 11:00:00",
      "token"
    )
    expect(cancelOrder).toHaveBeenCalled()
    expect(updateChaseStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: CHASE_STATUS.AWAITING_SIGNAL })
    )
  })
})
