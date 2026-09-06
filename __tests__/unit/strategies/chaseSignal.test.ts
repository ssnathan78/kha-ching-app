import dayjs from "dayjs"
import tz from "dayjs/plugin/timezone"
import utc from "dayjs/plugin/utc"

dayjs.extend(utc)
dayjs.extend(tz)

import { chaseAllowsNewEntry, chaseTolerances } from "../../../lib/chaseDefaults"
import { getAcceptedPrevEma, resolveChasePrevEma } from "../../../lib/chaseSignal"
import { CHASE_STATUS } from "../../../lib/constants"

jest.mock("../../../lib/kiteUtils", () => ({
  getPreviousTradingDay: jest.fn().mockResolvedValue(new Date("2026-09-04T06:30:00.000Z")),
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
  toIst: (value: dayjs.Dayjs | Date | string) => dayjs(value).tz("Asia/Kolkata"),
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

describe("resolveChasePrevEma", () => {
  const at1015 = dayjs.tz("2026-09-05 10:15", "Asia/Kolkata")

  it("seeds when this contract has no EMA row", async () => {
    await expect(resolveChasePrevEma(null, at1015, "tok")).resolves.toEqual({
      action: "seed",
      prevEma: null,
    })
  })

  it("continues from yesterday 16:15 at the 10:15 job", async () => {
    const prevRow = {
      ema: 24850,
      createdAt: dayjs.tz("2026-09-04 16:15", "Asia/Kolkata").toDate(),
    }
    await expect(resolveChasePrevEma(prevRow, at1015, "tok")).resolves.toEqual({
      action: "continue",
      prevEma: 24850,
    })
  })

  it("fails closed at 10:15 when yesterday 16:15 is missing", async () => {
    const prevRow = {
      ema: 24850,
      createdAt: dayjs.tz("2026-09-04 15:15", "Asia/Kolkata").toDate(),
    }
    await expect(resolveChasePrevEma(prevRow, at1015, "tok")).resolves.toEqual({
      action: "gap",
      prevEma: null,
      expectedLabel: "yesterday's 16:15 EMA row",
    })
  })

  it("fails closed at 11:15 when the 10:15 row is missing", async () => {
    const prevRow = {
      ema: 24850,
      createdAt: dayjs.tz("2026-09-04 16:15", "Asia/Kolkata").toDate(),
    }
    await expect(
      resolveChasePrevEma(prevRow, dayjs.tz("2026-09-05 11:15", "Asia/Kolkata"), "tok")
    ).resolves.toEqual({
      action: "gap",
      prevEma: null,
      expectedLabel: "the 10:15 EMA row",
    })
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
