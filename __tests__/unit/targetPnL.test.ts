jest.mock("../../lib/utils", () => ({
  getTimeLeftInMarketClosingMs: () => 60_000,
  isTimeAfterAutoSquareOff: () => false,
  withRemoteRetry: (fn: () => unknown) => (typeof fn === "function" ? fn() : fn),
  round: (n: number, p = 1) => Math.round(n / p) * p,
}))

jest.mock("../../lib/drizzleDbUtils", () => ({
  getValuesfromDB: jest.fn(),
  patchDbTrade: jest.fn().mockResolvedValue(undefined),
}))

jest.mock("../../lib/kiteUtils", () => ({
  syncGetKiteInstance: jest.fn(),
  getCompletedOrdersbyTag: jest.fn(),
  getInstrumentPrice: jest.fn().mockResolvedValue(0),
}))

jest.mock("../../lib/exit-strategies/autoSquareOff", () => ({
  squareOffTag: jest.fn().mockResolvedValue(undefined),
  default: jest.fn(),
}))

import { getValuesfromDB, patchDbTrade } from "../../lib/drizzleDbUtils"
import { squareOffTag } from "../../lib/exit-strategies/autoSquareOff"
import { getCompletedOrdersbyTag } from "../../lib/kiteUtils"
import targetPnL from "../../lib/targetPnL"

describe("targetPnL points-based exits", () => {
  const baseJob = {
    id: "job-1",
    orderTag: "tag-1",
    isMaxLossEnabled: true,
    isMaxProfitEnabled: true,
    isAutoSquareOffEnabled: false,
    trailingProfitPercent: 10,
    user: { session: { access_token: "t" } },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    const { getInstrumentPrice } = require("../../lib/kiteUtils")
    getInstrumentPrice.mockResolvedValue(0)
    ;(getValuesfromDB as jest.Mock).mockResolvedValue({
      trailingMaxLossPoints: -18,
      trailingMaxProfitPoints: 12,
    })
  })

  it("squares off when max loss breached (points, not rupees)", async () => {
    const { getInstrumentPrice } = require("../../lib/kiteUtils")
    getInstrumentPrice.mockResolvedValue(100)
    ;(getCompletedOrdersbyTag as jest.Mock).mockResolvedValue([
      { tradingsymbol: "X", quantity: -65, points: 0 },
    ])
    const result = await targetPnL({
      initialJobData: baseJob as any,
      rawKiteOrdersResponse: [{ quantity: 65, status: "COMPLETE" }],
      _kite: {},
    })
    expect(String(result)).toContain("loss has been breached")
    expect(squareOffTag).toHaveBeenCalledWith("tag-1", expect.anything())
  })

  it("raises trailing profit target when profit exceeded", async () => {
    ;(getCompletedOrdersbyTag as jest.Mock).mockResolvedValue([
      { tradingsymbol: "X", quantity: -65, points: 15 },
    ])
    await expect(
      targetPnL({
        initialJobData: baseJob as any,
        rawKiteOrdersResponse: [{ quantity: 65, status: "COMPLETE" }],
        _kite: {},
      })
    ).rejects.toThrow(/Updated with new profit/)
    expect(patchDbTrade).toHaveBeenCalled()
  })

  it("marks SQUARED_OFF when all legs flat", async () => {
    ;(getCompletedOrdersbyTag as jest.Mock).mockResolvedValue([
      { tradingsymbol: "X", quantity: 0, points: 5 },
    ])
    const result = await targetPnL({
      initialJobData: baseJob as any,
      rawKiteOrdersResponse: [],
      _kite: {},
    })
    expect(String(result)).toContain("all orders are completed")
    expect(patchDbTrade).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({ status: "SQUARED_OFF" })
    )
  })

  it("retries when inside profit/loss band", async () => {
    ;(getCompletedOrdersbyTag as jest.Mock).mockResolvedValue([
      { tradingsymbol: "X", quantity: -65, points: 0 },
    ])
    await expect(
      targetPnL({
        initialJobData: baseJob as any,
        rawKiteOrdersResponse: [{ quantity: 65 }],
        _kite: {},
      })
    ).rejects.toThrow(/retry for tag/)
  })
})

describe("targetPnL early termination", () => {
  it("stops when market closed", async () => {
    jest.resetModules()
    jest.doMock("../../lib/utils", () => ({
      getTimeLeftInMarketClosingMs: () => -1,
      isTimeAfterAutoSquareOff: () => false,
      withRemoteRetry: (fn: () => unknown) => (typeof fn === "function" ? fn() : fn),
      round: (n: number) => n,
    }))
    jest.doMock("../../lib/drizzleDbUtils", () => ({
      getValuesfromDB: jest.fn(),
      patchDbTrade: jest.fn(),
    }))
    jest.doMock("../../lib/kiteUtils", () => ({
      syncGetKiteInstance: jest.fn(),
      getCompletedOrdersbyTag: jest.fn(),
      getInstrumentPrice: jest.fn(),
    }))
    jest.doMock("../../lib/exit-strategies/autoSquareOff", () => ({
      squareOffTag: jest.fn(),
    }))
    const mod = await import("../../lib/targetPnL")
    const result = await mod.default({
      initialJobData: {
        id: "x",
        orderTag: "t",
        isMaxLossEnabled: false,
        isMaxProfitEnabled: false,
        isAutoSquareOffEnabled: false,
      } as any,
      rawKiteOrdersResponse: [],
    })
    expect(String(result)).toContain("Terminating")
  })
})
