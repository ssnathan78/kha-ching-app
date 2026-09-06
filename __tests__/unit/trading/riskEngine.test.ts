import {
  DEFAULT_RISK_SETTINGS,
  evaluateOrder,
  inferOrderRole,
  isPaperStrategy,
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
    tag: "job-1",
    lots: 1,
    ltp: 120,
    ltpAt: new Date("2026-09-05T10:00:00+05:30"),
    ...overrides,
  }
}

function ctx(overrides: Partial<RiskContext> = {}): RiskContext {
  return {
    settings: { ...DEFAULT_RISK_SETTINGS },
    now: new Date("2026-09-05T10:00:01+05:30"),
    isMock: true,
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

describe("inferOrderRole", () => {
  it("treats flatten and square-off as flatten", () => {
    expect(inferOrderRole({ purpose: "FLATTEN" })).toBe("FLATTEN")
    expect(inferOrderRole({ purpose: "SQUARE_OFF" })).toBe("FLATTEN")
  })

  it("treats SL order types as SL even without purpose", () => {
    expect(inferOrderRole({ orderType: "SL-M" })).toBe("SL")
    expect(inferOrderRole({ purpose: "EXIT" })).toBe("EXIT")
  })

  it("defaults market entries to ENTRY", () => {
    expect(inferOrderRole({ orderType: "MARKET" })).toBe("ENTRY")
  })
})

describe("evaluateOrder", () => {
  it("allows a normal mock entry", () => {
    expect(evaluateOrder(intent(), ctx())).toEqual({ ok: true })
  })

  it("rejects non-integer or non-positive quantity", () => {
    expect(evaluateOrder(intent({ quantity: 0 }), ctx()).ok).toBe(false)
    expect(evaluateOrder(intent({ quantity: 1.5 }), ctx()).ok).toBe(false)
    expect(evaluateOrder(intent({ quantity: -65 }), ctx()).ok).toBe(false)
  })

  it("allows a paper strategy without Desk allowLiveOrders", () => {
    const paper = evaluateOrder(intent(), ctx({ isMock: false, isPaper: true }))
    expect(paper).toEqual({ ok: true })
  })

  it("treats unknown and default strategies as paper", () => {
    expect(isPaperStrategy(DEFAULT_RISK_SETTINGS, "ATM_STRADDLE")).toBe(true)
    expect(isPaperStrategy(DEFAULT_RISK_SETTINGS, "BRAND_NEW")).toBe(true)
    expect(isPaperStrategy(DEFAULT_RISK_SETTINGS, null)).toBe(true)
    const live = {
      ...DEFAULT_RISK_SETTINGS,
      strategies: {
        ...DEFAULT_RISK_SETTINGS.strategies,
        ATM_STRADDLE: {
          ...DEFAULT_RISK_SETTINGS.strategies.ATM_STRADDLE,
          executionMode: "LIVE" as const,
        },
      },
    }
    expect(isPaperStrategy(live, "ATM_STRADDLE")).toBe(false)
    expect(isPaperStrategy(live, "ATM_STRANGLE")).toBe(true)
  })

  it("blocks live orders unless Desk allowLiveOrders is on", () => {
    const live = ctx({ isMock: false })
    const blocked = evaluateOrder(intent(), live)
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.code).toBe("LIVE_BLOCKED")

    const allowed = evaluateOrder(
      intent(),
      ctx({
        isMock: false,
        settings: { ...DEFAULT_RISK_SETTINGS, allowLiveOrders: true },
      })
    )
    expect(allowed).toEqual({ ok: true })
  })

  it("rejects new entries when the desk is halted but still allows flatten", () => {
    const halted = ctx({
      settings: { ...DEFAULT_RISK_SETTINGS, deskHalted: true, haltReason: "kill" },
    })
    const entry = evaluateOrder(intent(), halted)
    expect(entry.ok).toBe(false)
    if (!entry.ok) expect(entry.code).toBe("DESK_HALTED")

    expect(evaluateOrder(intent({ role: "FLATTEN" }), halted)).toEqual({ ok: true })
    expect(evaluateOrder(intent({ role: "SL", orderType: "SL" }), halted)).toEqual({ ok: true })
    expect(evaluateOrder(intent({ role: "EXIT" }), halted)).toEqual({ ok: true })
  })

  it("rejects stale prices and invalid LTPs", () => {
    const stale = evaluateOrder(
      intent({ ltpAt: new Date("2026-09-05T09:59:00+05:30") }),
      ctx({ now: new Date("2026-09-05T10:00:00+05:30") })
    )
    expect(stale.ok).toBe(false)
    if (!stale.ok) expect(stale.code).toBe("STALE_DATA")

    const invalid = evaluateOrder(intent({ ltp: 0 }), ctx())
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) expect(invalid.code).toBe("INVALID_PRICE")
  })

  it("enforces qty, lots, notional, position, order, and rate caps", () => {
    expect(evaluateOrder(intent({ quantity: 2000 }), ctx()).ok).toBe(false)
    expect(evaluateOrder(intent({ lots: 21 }), ctx()).ok).toBe(false)
    expect(evaluateOrder(intent({ quantity: 65, price: 50_000 }), ctx()).ok).toBe(false)
    expect(evaluateOrder(intent(), ctx({ openPositionCount: 12 })).ok).toBe(false)
    expect(evaluateOrder(intent(), ctx({ openOrderCount: 40 })).ok).toBe(false)
    expect(evaluateOrder(intent(), ctx({ recentOrderCount: 20 })).ok).toBe(false)
  })

  it("enforces daily loss and drawdown, then still allows flatten", () => {
    const loss = evaluateOrder(intent(), ctx({ dailyLossInr: -50_000 }))
    expect(loss.ok).toBe(false)
    if (!loss.ok) expect(loss.code).toBe("DAILY_LOSS")

    const dd = evaluateOrder(intent(), ctx({ drawdownPct: 0.15 }))
    expect(dd.ok).toBe(false)
    if (!dd.ok) expect(dd.code).toBe("DRAWDOWN")

    expect(evaluateOrder(intent({ role: "FLATTEN" }), ctx({ dailyLossInr: -80_000 }))).toEqual({
      ok: true,
    })
  })

  it("rejects a duplicate working entry", () => {
    const dup = evaluateOrder(intent(), ctx({ pendingDuplicate: true }))
    expect(dup.ok).toBe(false)
    if (!dup.ok) expect(dup.code).toBe("DUPLICATE")
  })

  it("rejects aborted jobs, disabled strategies, and closed markets for entries", () => {
    expect(evaluateOrder(intent(), ctx({ jobAborted: true })).ok).toBe(false)
    const settings = {
      ...DEFAULT_RISK_SETTINGS,
      strategies: {
        ...DEFAULT_RISK_SETTINGS.strategies,
        ATM_STRADDLE: { ...DEFAULT_RISK_SETTINGS.strategies.ATM_STRADDLE, enabled: false },
      },
    }
    expect(evaluateOrder(intent({ strategy: "ATM_STRADDLE" }), ctx({ settings })).ok).toBe(false)
    expect(evaluateOrder(intent({ strategy: "CHASE" }), ctx({ settings })).ok).toBe(true)
    expect(
      evaluateOrder(
        intent(),
        ctx({
          isMock: false,
          marketOpen: false,
          settings: { ...DEFAULT_RISK_SETTINGS, allowLiveOrders: true },
        })
      ).ok
    ).toBe(false)
  })

  it("uses per-strategy lot caps so one strategy's limit does not bind another", () => {
    const settings = {
      ...DEFAULT_RISK_SETTINGS,
      strategies: {
        ...DEFAULT_RISK_SETTINGS.strategies,
        ATM_STRADDLE: { ...DEFAULT_RISK_SETTINGS.strategies.ATM_STRADDLE, maxLots: 2 },
        CHASE: { ...DEFAULT_RISK_SETTINGS.strategies.CHASE, maxLots: 10 },
      },
    }
    expect(evaluateOrder(intent({ strategy: "ATM_STRADDLE", lots: 3 }), ctx({ settings })).ok).toBe(
      false
    )
    expect(
      evaluateOrder(intent({ strategy: "CHASE", lots: 3 }), ctx({ settings })).ok
    ).toBe(true)
  })
})
