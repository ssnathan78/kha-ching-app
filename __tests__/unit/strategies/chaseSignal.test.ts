import dayjs from "dayjs"
import tz from "dayjs/plugin/timezone"
import utc from "dayjs/plugin/utc"

dayjs.extend(utc)
dayjs.extend(tz)

import { chaseAllowsNewEntry, chaseTolerances } from "../../../lib/chaseDefaults"
import { decideChaseEntryAction, getAcceptedPrevEma, resolveChasePrevEma } from "../../../lib/chaseSignal"
import { CHASE_STATUS } from "../../../lib/constants"

jest.mock("../../../lib/kiteUtils", () => ({
  getPreviousTradingDay: jest.fn().mockResolvedValue(new Date("2026-09-04T06:30:00.000Z")),
  placeKiteOrder: jest.fn(),
  getKiteInstance: jest.fn().mockReturnValue({
    getLTP: jest.fn().mockResolvedValue({ "NFO:NIFTY25SEPFUT": { last_price: 24900 } }),
    getOrders: jest.fn().mockResolvedValue([]),
  }),
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
  isMockOrder: jest.fn().mockReturnValue(false),
}))

jest.mock("../../../lib/trading/riskSettings", () => ({
  getRiskSettings: jest.fn().mockResolvedValue({
    allowLiveOrders: false,
    strategies: { CHASE: { executionMode: "PAPER" } },
  }),
}))

jest.mock("../../../lib/trading/ledger", () => ({
  recordDecision: jest.fn().mockResolvedValue("decision-1"),
  getOpenPositions: jest.fn().mockResolvedValue([]),
  getOpenOrders: jest.fn().mockResolvedValue([]),
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

  it("reuses last stored EMA at 10:15 when yesterday 16:15 is missing", async () => {
    const prevRow = {
      ema: 24850,
      createdAt: dayjs.tz("2026-09-04 15:15", "Asia/Kolkata").toDate(),
    }
    await expect(resolveChasePrevEma(prevRow, at1015, "tok")).resolves.toEqual({
      action: "gap",
      prevEma: 24850,
      expectedLabel: "yesterday's 16:15 EMA row",
    })
  })

  it("reuses last stored EMA at 11:15 when the 10:15 row is missing", async () => {
    const prevRow = {
      ema: 24850,
      createdAt: dayjs.tz("2026-09-04 16:15", "Asia/Kolkata").toDate(),
    }
    await expect(
      resolveChasePrevEma(prevRow, dayjs.tz("2026-09-05 11:15", "Asia/Kolkata"), "tok")
    ).resolves.toEqual({
      action: "gap",
      prevEma: 24850,
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

describe("decideChaseEntryAction", () => {
  it("does not mark a fill when automated qty is flat and no working order", () => {
    expect(
      decideChaseEntryAction({
        automated: true,
        quantity: 130,
        netQty: 0,
        side: "SHORT",
        hasOpenEntryOrder: false,
      })
    ).toBe("place_entry")
  })

  it("waits when an entry order is already working", () => {
    expect(
      decideChaseEntryAction({
        automated: true,
        quantity: 130,
        netQty: 0,
        side: "SHORT",
        hasOpenEntryOrder: true,
      })
    ).toBe("wait_open_order")
  })

  it("treats a short book as filled", () => {
    expect(
      decideChaseEntryAction({
        automated: true,
        quantity: 130,
        netQty: -130,
        side: "SHORT",
        hasOpenEntryOrder: false,
      })
    ).toBe("already_filled")
  })

  it("does not treat missing lots as a fill", () => {
    expect(
      decideChaseEntryAction({
        automated: false,
        quantity: 0,
        netQty: 0,
        side: "SHORT",
        hasOpenEntryOrder: false,
      })
    ).toBe("signal_only")
  })

  it("refuses a new entry while the opposite paper/live book is open", () => {
    expect(
      decideChaseEntryAction({
        automated: true,
        quantity: 130,
        netQty: 0,
        side: "SHORT",
        hasOpenEntryOrder: false,
        otherBookOpen: true,
      })
    ).toBe("other_book_open")
  })
})

describe("generateSignal entry order failure stays awaiting", () => {
  it("keeps AWAITING_SHORT and does not throw when the entry order fails", async () => {
    const { getChaseStatus, updateChaseStatus } = require("../../../lib/drizzleDbUtils")
    const { getChaseSettings } = require("../../../lib/chaseSettings")
    const { placeKiteOrder, getKiteInstance } = require("../../../lib/kiteUtils")
    getChaseSettings.mockResolvedValue({ lots: 2, paused: false })
    getChaseStatus.mockResolvedValue({
      status: CHASE_STATUS.AWAITING_SIGNAL,
      tradingsymbol: null,
    })
    getKiteInstance.mockReturnValue({
      getLTP: jest.fn().mockResolvedValue({ "NFO:NIFTY26SEPFUT": { last_price: 23916.8 } }),
      getOrders: jest.fn().mockResolvedValue([]),
    })
    placeKiteOrder.mockRejectedValue(new Error("orders_provenance_chk"))

    const { generateSignal } = await import("../../../lib/chaseSignal")
    await expect(
      generateSignal(
        [
          {
            tradingsymbol: "NIFTY26SEPFUT",
            instrumentToken: 1,
            ema: 24116.93,
            highestHigh: 24000,
            lowestLow: 23920,
            lastClose: 23921,
            lotSize: 65,
          },
        ],
        "2026-09-07 10:15:00",
        "token"
      )
    ).resolves.toBeUndefined()
    expect(updateChaseStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: CHASE_STATUS.AWAITING_SHORT })
    )
    expect(placeKiteOrder).toHaveBeenCalled()
  })
})

describe("generateSignal phantom LONG/SHORT", () => {
  it("resets SHORT with no fill and evaluates a fresh signal", async () => {
    const { getChaseStatus, updateChaseStatus } = require("../../../lib/drizzleDbUtils")
    const { getChaseSettings } = require("../../../lib/chaseSettings")
    const { placeKiteOrder, getKiteInstance } = require("../../../lib/kiteUtils")
    const { getOpenPositions } = require("../../../lib/trading/ledger")
    getChaseSettings.mockResolvedValue({ lots: 2, paused: false })
    getOpenPositions.mockResolvedValue([])
    getChaseStatus.mockResolvedValue({
      status: CHASE_STATUS.SHORT,
      tradingsymbol: "NIFTY26SEPFUT",
      entryPoint: 23765,
      stoploss: 24045,
    })
    getKiteInstance.mockReturnValue({
      getLTP: jest.fn().mockResolvedValue({ "NFO:NIFTY26SEPFUT": { last_price: 23921 } }),
      getOrders: jest.fn().mockResolvedValue([]),
    })
    placeKiteOrder.mockRejectedValue(new Error("MAX_NOTIONAL"))

    const { generateSignal } = await import("../../../lib/chaseSignal")
    await generateSignal(
      [
        {
          tradingsymbol: "NIFTY26SEPFUT",
          instrumentToken: 1,
          ema: 24116.93,
          highestHigh: 24000,
          lowestLow: 23765,
          lastClose: 23921,
          lotSize: 65,
        },
      ],
      "2026-09-08 12:15:00",
      "token"
    )
    expect(updateChaseStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: CHASE_STATUS.AWAITING_SIGNAL })
    )
    expect(updateChaseStatus).toHaveBeenCalledWith(
      expect.objectContaining({ status: CHASE_STATUS.AWAITING_SHORT })
    )
  })

  it("holds SHORT when the paper book actually has size", async () => {
    const { getChaseStatus, updateChaseStatus } = require("../../../lib/drizzleDbUtils")
    const { getChaseSettings } = require("../../../lib/chaseSettings")
    const { placeKiteOrder } = require("../../../lib/kiteUtils")
    const { getOpenPositions } = require("../../../lib/trading/ledger")
    getChaseSettings.mockResolvedValue({ lots: 2, paused: false })
    getOpenPositions.mockResolvedValue([{ tradingsymbol: "NIFTY26SEPFUT", quantity: -130 }])
    getChaseStatus.mockResolvedValue({
      status: CHASE_STATUS.SHORT,
      tradingsymbol: "NIFTY26SEPFUT",
    })
    placeKiteOrder.mockClear()
    updateChaseStatus.mockClear()

    const { generateSignal } = await import("../../../lib/chaseSignal")
    await generateSignal(
      [
        {
          tradingsymbol: "NIFTY26SEPFUT",
          instrumentToken: 1,
          ema: 24116.93,
          highestHigh: 24000,
          lowestLow: 23765,
          lastClose: 23921,
          lotSize: 65,
        },
      ],
      "2026-09-08 12:15:00",
      "token"
    )
    expect(updateChaseStatus).not.toHaveBeenCalled()
    expect(placeKiteOrder).not.toHaveBeenCalled()
  })
})
