import { chaseTolerances } from "../../lib/chaseDefaults"
import { simulate } from "../../lib/simulation/runner"
import { DEFAULT_RISK_SETTINGS, evaluateOrder } from "../../lib/trading/riskEngine"

describe("strategy-faithful scenarios", () => {
  it("Chase uses real EMA buffer tolerances (does not invent a different trigger)", () => {
    const { longTolerance, shortTolerance } = chaseTolerances(25000, 0.2)
    expect(longTolerance).toBeCloseTo(25050, 5)
    expect(shortTolerance).toBeCloseTo(24950, 5)
  })

  it("Chase paused produces no entry (chaseAllowsNewEntry)", () => {
    const result = simulate({ scenario: "strategy-paused", seed: 1 })
    expect(result.orders.length).toBe(0)
    expect(result.signals.length).toBe(0)
  })

  it("Chase almost-trigger stays inside the buffer", () => {
    const result = simulate({
      scenario: "flat",
      seed: 1,
      start: "2026-09-07 09:20",
      end: "2026-09-07 10:00",
      actors: [
        {
          kind: "chase",
          strategy: "SUBSCRIBE_CHASE",
          symbol: "NIFTY26SEPFUT",
          lots: 1,
          ema: 25000,
          bufferPercent: 0.2,
        },
      ],
    })
    expect(result.signals.length).toBe(0)
  })

  it("Chase triggers when last is through the long tolerance", () => {
    const result = simulate({ scenario: "normal-signal", seed: 1 })
    expect(result.signals.some(s => s.kind === "AWAITING_LONG")).toBe(true)
    expect(result.orders.length).toBeGreaterThan(0)
  })

  it("disabled strategy is rejected by the real risk engine", () => {
    const decision = evaluateOrder(
      {
        role: "ENTRY",
        tradingsymbol: "NIFTY26SEPFUT",
        quantity: 65,
        side: "SELL",
        strategy: "ATM_STRADDLE",
      },
      {
        settings: {
          ...DEFAULT_RISK_SETTINGS,
          strategies: {
            ...DEFAULT_RISK_SETTINGS.strategies,
            ATM_STRADDLE: { ...DEFAULT_RISK_SETTINGS.strategies.ATM_STRADDLE, enabled: false },
          },
        },
        now: new Date("2026-09-07T04:30:00.000Z"),
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
      }
    )
    expect(decision.ok).toBe(false)
    if (!decision.ok) expect(decision.code).toBe("STRATEGY_DISABLED")
  })

  it("boundary: qty at max is allowed, qty max+1 is rejected", () => {
    const settings = { ...DEFAULT_RISK_SETTINGS, maxQtyPerOrder: 65 }
    const ctx = {
      settings,
      now: new Date(),
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
    }
    const at = evaluateOrder({ role: "ENTRY", tradingsymbol: "X", quantity: 65, side: "BUY" }, ctx)
    const over = evaluateOrder(
      { role: "ENTRY", tradingsymbol: "X", quantity: 66, side: "BUY" },
      ctx
    )
    expect(at).toEqual({ ok: true })
    expect(over.ok).toBe(false)
  })
})
