import dayjs from "dayjs"

import { EXIT_STRATEGIES, INSTRUMENTS, STRANGLE_ENTRY_STRATEGIES } from "../../../lib/constants"

jest.mock("../../../lib/exit-strategies/autoSquareOff", () => ({
  doSquareOffPositions: jest.fn().mockResolvedValue(undefined),
}))

jest.mock("../../../lib/drizzleDbUtils", () => ({
  patchDbTrade: jest.fn().mockResolvedValue(undefined),
  getValuesfromDB: jest.fn(),
}))

jest.mock("../../../lib/kiteUtils", () => ({
  syncGetKiteInstance: jest.fn(() => ({
    EXCHANGE_NFO: "NFO",
    TRANSACTION_TYPE_SELL: "SELL",
    TRANSACTION_TYPE_BUY: "BUY",
    ORDER_TYPE_MARKET: "MARKET",
    VALIDITY_DAY: "DAY",
    STATUS_COMPLETE: "COMPLETE",
  })),
  getIndexInstruments: jest
    .fn()
    .mockResolvedValue([
      { name: "NIFTY", strike: 25000, instrument_type: "PE", expiry: "2025-09-30" },
    ]),
  getInstrumentPrice: jest.fn().mockResolvedValue(25000),
  getSkew: jest.fn().mockResolvedValue({ skew: 5 }),
  getExpiryTradingSymbol: jest.fn().mockImplementation(({ strike, instrumentType }) =>
    Promise.resolve({
      tradingsymbol: `NIFTY25SEP${strike}${instrumentType ?? "PE"}`,
      lot_size: 65,
    })
  ),
  ensureMarginForBasketOrder: jest.fn().mockResolvedValue(true),
  getHedgeForStrike: jest.fn().mockResolvedValue("NIFTY25SEP24000PE"),
  getOTMStrangleByOptionPrice: jest.fn().mockResolvedValue([]),
  remoteOrderSuccessEnsurer: jest
    .fn()
    .mockImplementation(({ orderProps }) =>
      Promise.resolve({ ...orderProps, status: "COMPLETE", order_id: "o1", average_price: 50 })
    ),
}))

jest.mock("../../../lib/utils", () => ({
  withRemoteRetry: (fn: () => unknown) => (typeof fn === "function" ? fn() : fn),
  attemptBrokerOrders: jest.fn().mockImplementation(async (promises: Promise<unknown>[]) => ({
    allOk: true,
    statefulOrders: await Promise.all(promises),
  })),
  isMarketOpen: jest.fn().mockReturnValue(true),
  isMockOrder: jest.fn().mockReturnValue(true),
}))

import atmStrangle from "../../../lib/strategies/strangle"
import { baseStrangleJob } from "../../support/jobFixtures"
import { createTestUser } from "../../support/sessionFactory"

describe("atmStrangle", () => {
  const user = createTestUser()

  it("executes distance-from-ATM entry with exit queue when SL enabled", async () => {
    const res = await atmStrangle({
      ...baseStrangleJob({
        exitStrategy: EXIT_STRATEGIES.INDIVIDUAL_LEG_SLM_1X,
        entryStrategy: STRANGLE_ENTRY_STRATEGIES.DISTANCE_FROM_ATM,
        distanceFromAtm: 2,
      }),
      _kite: {},
      user,
      instrument: INSTRUMENTS.NIFTY,
      orderTag: "strangle-1",
    } as any)
    expect(res?._nextTradingQueue).toBeTruthy()
    expect(res?.rawKiteOrdersResponse?.length).toBe(2)
  })

  it("NO_SL skips exit queue", async () => {
    const res = await atmStrangle({
      ...baseStrangleJob({
        exitStrategy: EXIT_STRATEGIES.NO_SL,
        entryStrategy: STRANGLE_ENTRY_STRATEGIES.DISTANCE_FROM_ATM,
      }),
      _kite: {},
      user,
      instrument: INSTRUMENTS.NIFTY,
      orderTag: "strangle-2",
    } as any)
    expect(res?._nextTradingQueue).toBeUndefined()
  })

  it("rejects when market closed", async () => {
    const { isMarketOpen } = require("../../../lib/utils")
    isMarketOpen.mockReturnValueOnce(false)
    await expect(
      atmStrangle({
        ...baseStrangleJob(),
        _kite: {},
        user,
        instrument: INSTRUMENTS.NIFTY,
        orderTag: "closed",
      } as any)
    ).rejects.toThrow(/Market is closed/)
  })

  it("rejects insufficient margin", async () => {
    const { ensureMarginForBasketOrder } = require("../../../lib/kiteUtils")
    ensureMarginForBasketOrder.mockResolvedValueOnce(false)
    await expect(
      atmStrangle({
        ...baseStrangleJob(),
        _kite: {},
        user,
        instrument: INSTRUMENTS.NIFTY,
        orderTag: "nomargin",
      } as any)
    ).rejects.toThrow(/insufficient margin/)
  })
})
