import dayjs from "dayjs"

import { EXIT_STRATEGIES, INSTRUMENTS, VOLATILITY_TYPE } from "../../../lib/constants"

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
  getIndexInstruments: jest.fn().mockResolvedValue([]),
  getInstrumentPrice: jest.fn().mockResolvedValue(25000),
  getSkew: jest.fn().mockResolvedValue({ skew: 5 }),
  getExpiryTradingSymbol: jest.fn().mockResolvedValue({
    PE_STRING: "NIFTY25SEP25000PE",
    CE_STRING: "NIFTY25SEP25000CE",
    LOT_SIZE: 65,
  }),
  ensureMarginForBasketOrder: jest.fn().mockResolvedValue(true),
  getHedgeForStrike: jest.fn().mockResolvedValue("NIFTY25SEP24500PE"),
  remoteOrderSuccessEnsurer: jest
    .fn()
    .mockImplementation(({ orderProps }) =>
      Promise.resolve({ ...orderProps, status: "COMPLETE", order_id: "o1", average_price: 100 })
    ),
}))

jest.mock("../../../lib/utils", () => ({
  withRemoteRetry: (fn: () => unknown) => (typeof fn === "function" ? fn() : fn),
  attemptBrokerOrders: jest.fn().mockImplementation(async (promises: Promise<unknown>[]) => ({
    allOk: true,
    statefulOrders: await Promise.all(promises),
  })),
  delay: jest.fn(),
  ms: (s: number) => s * 1000,
  isMarketOpen: () => true,
  isMockOrder: () => true,
}))

import atmStraddle, { createOrder, getATMStraddle } from "../../../lib/strategies/atmStraddle"
import { baseStraddleJob } from "../../support/jobFixtures"
import { createTestUser } from "../../support/sessionFactory"

describe("createOrder", () => {
  it("short vol sells both legs with correct quantity", () => {
    const user = createTestUser()
    const order = createOrder({
      symbol: "NIFTY25SEP25000CE",
      lots: 2,
      lotSize: 65,
      user,
      orderTag: "tag1",
      productType: "MIS" as any,
    })
    expect(order.quantity).toBe(130)
    expect(order.transaction_type).toBe("SELL")
  })

  it("long vol buys legs", () => {
    const user = createTestUser()
    const order = createOrder({
      symbol: "NIFTY25SEP25000CE",
      lots: 1,
      lotSize: 65,
      user,
      orderTag: "tag1",
      transactionType: "BUY",
      productType: "MIS" as any,
    })
    expect(order.transaction_type).toBe("BUY")
  })
})

describe("getATMStraddle skew gate", () => {
  const user = createTestUser()
  const baseArgs = {
    user,
    underlyingSymbol: "NIFTY 50",
    exchange: "NSE",
    nfoSymbol: "NIFTY",
    strikeStepSize: 50,
    maxSkewPercent: 10,
    thresholdSkewPercent: 20,
    takeTradeIrrespectiveSkew: false,
    expiryType: "CURRENT",
    instrumentsData: [],
    startTime: dayjs(),
  }

  it("rejects when skew timeout and takeTradeIrrespectiveSkew false", async () => {
    await expect(
      getATMStraddle({
        ...baseArgs,
        expiresAt: dayjs().subtract(1, "minute").format(),
        _kite: {},
      } as any)
    ).rejects.toThrow(/time expired/)
  })

  it("enters when takeTradeIrrespectiveSkew true after timeout", async () => {
    const result = await getATMStraddle({
      ...baseArgs,
      expiresAt: dayjs().subtract(1, "minute").format(),
      takeTradeIrrespectiveSkew: true,
      _kite: {},
    } as any)
    expect(result.CE_STRING).toBeTruthy()
  })
})

describe("atmStraddle execution", () => {
  const user = createTestUser()

  it("returns exit queue when individual leg SL configured", async () => {
    const res = await atmStraddle({
      ...baseStraddleJob({
        exitStrategy: EXIT_STRATEGIES.INDIVIDUAL_LEG_SLM_1X,
        expiresAt: dayjs().add(5, "minute").format(),
      }),
      _kite: {},
      user,
      instrument: INSTRUMENTS.NIFTY,
      orderTag: "test-tag",
    } as any)
    expect(res?._nextTradingQueue).toBeTruthy()
    expect(res?.isTargetEnabled).toBeDefined()
  })

  it("omits exit queue for NO_SL", async () => {
    const res = await atmStraddle({
      ...baseStraddleJob({
        exitStrategy: EXIT_STRATEGIES.NO_SL,
        isMaxLossEnabled: false,
        isMaxProfitEnabled: false,
        expiresAt: dayjs().add(5, "minute").format(),
      }),
      _kite: {},
      user,
      instrument: INSTRUMENTS.NIFTY,
      orderTag: "test-tag-2",
    } as any)
    expect(res?._nextTradingQueue).toBeUndefined()
  })

  it("rejects insufficient margin", async () => {
    const { ensureMarginForBasketOrder } = require("../../../lib/kiteUtils")
    ensureMarginForBasketOrder.mockResolvedValueOnce(false)
    await expect(
      atmStraddle({
        ...baseStraddleJob({ expiresAt: dayjs().add(5, "minute").format() }),
        _kite: {},
        user,
        instrument: INSTRUMENTS.NIFTY,
        orderTag: "m1",
      } as any)
    ).rejects.toThrow(/insufficient margin/)
  })
})
