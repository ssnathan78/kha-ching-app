import { shouldAbortStraddleForClosedMarket } from "../../../lib/strategyHours"
import {
  DEFAULT_RISK_SETTINGS,
  evaluateOrder,
  type RiskContext,
  type RiskIntent,
} from "../../../lib/trading/riskEngine"

function intent(overrides: Partial<RiskIntent> = {}): RiskIntent {
  return {
    role: "ENTRY",
    tradingsymbol: "NIFTY25SEP25000CE",
    quantity: 65,
    side: "SELL",
    product: "MIS",
    orderType: "MARKET",
    strategy: "ATM_STRADDLE",
    lots: 1,
    ltp: 120,
    ltpAt: new Date("2026-09-07T10:00:00+05:30"),
    ...overrides,
  }
}

function ctx(overrides: Partial<RiskContext> = {}): RiskContext {
  return {
    settings: { ...DEFAULT_RISK_SETTINGS },
    now: new Date("2026-09-07T10:00:01+05:30"),
    isMock: false,
    isPaper: false,
    marketOpen: true,
    jobAborted: false,
    openPositionCount: 0,
    openOrderCount: 0,
    recentOrderCount: 0,
    pendingDuplicate: false,
    dailyLossInr: 0,
    drawdownPct: 0,
    ...overrides,
  }
}

const liveSettings = {
  ...DEFAULT_RISK_SETTINGS,
  allowLiveOrders: true,
  strategies: {
    ...DEFAULT_RISK_SETTINGS.strategies,
    ATM_STRADDLE: {
      ...DEFAULT_RISK_SETTINGS.strategies.ATM_STRADDLE,
      executionMode: "LIVE" as const,
    },
  },
}

describe("triple gate (evaluateOrder)", () => {
  it("allows when MOCK_ORDERS is on", () => {
    expect(evaluateOrder(intent(), ctx({ isMock: true, isPaper: false }))).toEqual({ ok: true })
  })

  it("allows paper strategy without allowLiveOrders", () => {
    expect(evaluateOrder(intent(), ctx({ isMock: false, isPaper: true }))).toEqual({ ok: true })
  })

  it("allows live when mock is off, allowLiveOrders is on, strategy is LIVE, and session is open", () => {
    expect(
      evaluateOrder(intent(), ctx({ isMock: false, isPaper: false, settings: liveSettings }))
    ).toEqual({ ok: true })
  })

  it.each([
    ["mock off, paper off, allowLiveOrders off", { isMock: false, isPaper: false }],
    [
      "mock off, strategy LIVE, allowLiveOrders off",
      {
        isMock: false,
        isPaper: false,
        settings: { ...liveSettings, allowLiveOrders: false },
      },
    ],
  ] as const)("blocks LIVE_BLOCKED when %s", (_label, overrides) => {
    const decision = evaluateOrder(intent(), ctx(overrides))
    expect(decision.ok).toBe(false)
    if (!decision.ok) expect(decision.code).toBe("LIVE_BLOCKED")
  })

  it("blocks live entries when the session is closed even if the triple gate is open", () => {
    const decision = evaluateOrder(
      intent(),
      ctx({ isMock: false, isPaper: false, marketOpen: false, settings: liveSettings })
    )
    expect(decision.ok).toBe(false)
    if (!decision.ok) expect(decision.code).toBe("MARKET_CLOSED")
  })
})

describe("shouldAbortStraddleForClosedMarket", () => {
  it("does not abort when mock is on", () => {
    expect(shouldAbortStraddleForClosedMarket(true, false)).toBe(false)
  })

  it("aborts live punches when the market is closed", () => {
    expect(shouldAbortStraddleForClosedMarket(false, false)).toBe(true)
    expect(shouldAbortStraddleForClosedMarket(false, true)).toBe(false)
  })
})
