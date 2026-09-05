/** Lighter mocks for API tests — real Postgres/Redis in CI; no drizzle stub. */
jest.mock("axios", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    create: jest.fn(() => ({ get: jest.fn(), post: jest.fn() })),
  },
}))

jest.mock("../lib/queue-processor", () => ({}))

jest.mock("../lib/queue", () => {
  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: "mock-job" }),
    obliterate: jest.fn().mockResolvedValue(undefined),
    getJob: jest.fn(),
    upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
    removeJobScheduler: jest.fn().mockResolvedValue(undefined),
  }
  return {
    QID: process.env.KITE_API_KEY || "test",
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

jest.mock("iron-session", () => ({
  getIronSession: jest.fn(),
}))
