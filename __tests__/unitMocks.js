/** Shared mocks for hermetic unit tests (not used by integration). */
jest.mock("axios", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    create: jest.fn(() => ({ get: jest.fn(), post: jest.fn() })),
  },
}))

jest.mock("../lib/schema", () => ({
  jobExecutions: { id: "id", status: "status", orderTag: "order_tag" },
  tradePlans: { id: "id", dayOfWeek: "day_of_week", strategy: "strategy" },
  chaseSettings: { id: "id", instruments: "instruments" },
  riskSettings: { id: "id", strategyLimits: "strategy_limits" },
  transactions: {},
  accesstoken: {},
  ema: {},
  chaseStatus: { id: "id", instrument: "instrument" },
  chaseLog: {},
}))

const mockDbReturning = jest.fn().mockResolvedValue([
  {
    id: "mock-job-id",
    strategy: "ATM_STRADDLE",
    status: "QUEUE",
    orderTag: "mock-tag",
    order_tag: "mock-tag",
  },
])

jest.mock("../lib/drizzle", () => ({
  db: {
    select: jest.fn().mockReturnValue({
      from: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          orderBy: jest.fn().mockResolvedValue([]),
          limit: jest.fn().mockResolvedValue([]),
        }),
        orderBy: jest.fn().mockResolvedValue([]),
      }),
    }),
    insert: jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        returning: mockDbReturning,
        onConflictDoNothing: jest.fn().mockReturnValue({
          returning: mockDbReturning,
        }),
        onConflictDoUpdate: jest.fn().mockResolvedValue([]),
      }),
    }),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue({
          returning: mockDbReturning,
        }),
      }),
    }),
    delete: jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    }),
  },
  pool: {
    query: jest.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
  },
  schema: {},
}))

jest.mock("../lib/drizzleDbUtils", () => ({
  getLatestAccessToken: jest.fn(),
  storeAccessToken: jest.fn(),
  getValuesfromDB: jest.fn(),
  patchDbTrade: jest.fn().mockResolvedValue(undefined),
  updateChaseStatus: jest.fn().mockResolvedValue(undefined),
  getChaseSettings: jest.fn().mockResolvedValue({ lots: 1, paused: false }),
  saveChaseSettings: jest.fn().mockResolvedValue({ lots: 1, paused: false }),
}))

jest.mock("../lib/queue-processor", () => ({}))

jest.mock("../lib/trading/riskGate", () => ({
  assertOrderAllowed: jest.fn().mockResolvedValue(undefined),
  liveOrdersAllowedByEnv: jest.fn().mockReturnValue(false),
}))

jest.mock("../lib/trading/ledger", () => ({
  recordDecision: jest.fn().mockResolvedValue("mock-decision"),
  recordOrderIntent: jest.fn().mockResolvedValue({ id: "mock-order", created: true }),
  markOrderSubmitted: jest.fn().mockResolvedValue(undefined),
  markOrderUnknown: jest.fn().mockResolvedValue(undefined),
  applyBrokerOrderSnapshot: jest.fn().mockResolvedValue({ orderId: "mock-order", fillIds: [] }),
  applyUnappliedFills: jest.fn().mockResolvedValue(0),
  applyFillById: jest.fn().mockResolvedValue(false),
  recordAuditEvent: jest.fn().mockResolvedValue(undefined),
  safeRecordOrderFromKiteProps: jest.fn().mockResolvedValue("mock-order"),
  ensureDefaultAccount: jest.fn().mockResolvedValue(undefined),
  lookupJobByTag: jest.fn().mockResolvedValue(null),
  getOpenOrders: jest.fn().mockResolvedValue([]),
  getOpenPositions: jest.fn().mockResolvedValue([]),
  bookTestFill: jest.fn(),
}))

jest.mock("../lib/kiteUtils", () => ({
  syncGetKiteInstance: jest.fn(() => ({
    STATUS_COMPLETE: "COMPLETE",
    STATUS_CANCELLED: "CANCELLED",
    ORDER_TYPE_MARKET: "MARKET",
    getOrderHistory: jest.fn().mockResolvedValue([{ status: "COMPLETE", order_id: "1" }]),
    getOrders: jest.fn().mockResolvedValue([]),
    getPositions: jest.fn().mockResolvedValue({ net: [] }),
    modifyOrder: jest.fn(),
  })),
}))

jest.mock("../lib/queue", () => {
  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: "mock-job" }),
    obliterate: jest.fn().mockResolvedValue(undefined),
    getJob: jest.fn(),
    upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
    removeJobScheduler: jest.fn().mockResolvedValue(undefined),
  }
  return {
    QID: "test",
    TRADING_Q_NAME: "tradingQueue_test",
    EXIT_TRADING_Q_NAME: "exitTradingQueue_test",
    AUTO_SQUARE_OFF_Q_NAME: "autoSquareOffQueue_test",
    ANCILLARY_Q_NAME: "ancillaryQueue_test",
    TARGETPNL_Q_NAME: "targetPnlQueue_test",
    CHASE_Q_NAME: "chaseQueue_test",
    CHASE_EMA_SCHEDULER_ID: "chase-calculateEMA",
    CHASE_UPDATE_SL_SCHEDULER_ID: "chase-updateSL",
    redisConnection: {
      disconnect: jest.fn(),
      quit: jest.fn(),
      ping: jest.fn().mockResolvedValue("PONG"),
      status: "ready",
    },
    tradingQueue: mockQueue,
    targetPnLQueue: mockQueue,
    exitTradesQueue: mockQueue,
    autoSquareOffQueue: mockQueue,
    ancillaryQueue: mockQueue,
    chaseQueue: mockQueue,
    addToNextQueue: jest.fn().mockResolvedValue(undefined),
    addToAutoSquareOffQueue: jest.fn().mockResolvedValue(undefined),
    addToCoSquareOff: jest.fn().mockResolvedValue(undefined),
    addToAncillaryQueue: jest.fn().mockResolvedValue(undefined),
    cleanupQueues: jest.fn().mockResolvedValue(undefined),
    addToChaseQueue: jest.fn().mockResolvedValue(true),
  }
})
