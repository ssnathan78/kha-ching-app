import { DEFAULT_RISK_SETTINGS } from "../trading/riskEngine"
import type { SimulateConfig } from "./types"

const NIFTY = { symbol: "NIFTY26SEPFUT", lotSize: 65, startPrice: 25000 }
const BANK = { symbol: "BANKNIFTY26SEPFUT", lotSize: 30, startPrice: 52000 }

const MON = "2026-09-07"
const FRI = "2026-09-04"

function day(
  date: string,
  from: string,
  to: string,
  extra: Partial<SimulateConfig> = {}
): SimulateConfig {
  return {
    scenario: extra.scenario ?? "custom",
    start: `${date} ${from}`,
    end: `${date} ${to}`,
    seed: extra.seed ?? 1,
    instruments: extra.instruments ?? [NIFTY],
    pricePath: extra.pricePath ?? "sideways",
    volatility: extra.volatility ?? "normal",
    liquidity: extra.liquidity ?? "normal",
    stepMinutes: extra.stepMinutes ?? 5,
    paperRisk: extra.paperRisk ?? true,
    ...extra,
  }
}

const NAMED: Record<string, () => SimulateConfig> = {
  "normal-day": () =>
    day(MON, "09:00", "16:00", {
      scenario: "normal-day",
      pricePath: "sideways",
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
      ],
      assertions: [{ type: "order_count", min: 1 }],
    }),
  "pre-market": () =>
    day(MON, "08:00", "09:14", {
      scenario: "pre-market",
      paperRisk: false,
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "08:30",
        },
      ],
      assertions: [{ type: "closed_market_no_live_entries" }],
    }),
  "market-open": () =>
    day(MON, "09:00", "09:45", {
      scenario: "market-open",
      stepMinutes: 1,
      pricePath: "volatility_spike",
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:16",
        },
      ],
    }),
  midday: () => day(MON, "12:00", "13:00", { scenario: "midday", pricePath: "sideways" }),
  "market-close": () =>
    day(MON, "15:15", "16:10", {
      scenario: "market-close",
      stepMinutes: 1,
      paperRisk: false,
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "15:59",
        },
      ],
      assertions: [{ type: "closed_market_no_live_entries" }],
    }),
  "post-market": () =>
    day(MON, "15:30", "16:30", {
      scenario: "post-market",
      paperRisk: false,
      actors: [{ kind: "chase", strategy: "CHASE", symbol: NIFTY.symbol, lots: 1, ema: 25000 }],
      assertions: [{ type: "no_orders" }],
    }),
  overnight: () => ({
    scenario: "overnight",
    start: `${MON} 15:45`,
    end: "2026-09-08 09:45",
    seed: 2,
    instruments: [NIFTY],
    pricePath: "gap_down",
    stepMinutes: 30,
    actors: [
      {
        kind: "straddle",
        strategy: "ATM_STRADDLE",
        symbol: NIFTY.symbol,
        lots: 1,
        fireAt: "09:20",
      },
    ],
  }),
  weekend: () => ({
    scenario: "weekend",
    start: `${FRI} 15:00`,
    end: "2026-09-07 10:00",
    seed: 3,
    instruments: [NIFTY],
    pricePath: "gap_up",
    stepMinutes: 60,
    paperRisk: false,
    actors: [{ kind: "chase", strategy: "CHASE", symbol: NIFTY.symbol, lots: 1, ema: 24900 }],
    assertions: [{ type: "closed_market_no_live_entries" }],
  }),
  "live-weekend-block": () => NAMED.weekend(),
  "mock-weekend-entry": () => ({
    scenario: "mock-weekend-entry",
    start: "2026-09-05 10:00",
    end: "2026-09-05 12:00",
    seed: 11,
    instruments: [NIFTY],
    pricePath: "sideways",
    stepMinutes: 10,
    paperRisk: true,
    actors: [
      {
        kind: "straddle",
        strategy: "ATM_STRADDLE",
        symbol: NIFTY.symbol,
        lots: 1,
        fireAt: "10:20",
      },
    ],
    assertions: [{ type: "order_count", min: 1 }],
  }),
  holiday: () =>
    day("2026-01-26", "09:00", "16:00", {
      scenario: "holiday",
      paperRisk: false,
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
      ],
      assertions: [{ type: "closed_market_no_live_entries" }],
    }),
  "unexpected-closure": () =>
    day(MON, "09:00", "16:00", {
      scenario: "unexpected-closure",
      calendar: { closedDates: [MON] },
      paperRisk: false,
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
      ],
      assertions: [{ type: "closed_market_no_live_entries" }],
    }),
  "market-halt": () =>
    day(MON, "09:20", "11:00", {
      scenario: "market-halt",
      sessionSchedule: [
        { at: `${MON} 10:00`, state: "HALTED" },
        { at: `${MON} 10:40`, state: null },
      ],
      actors: [
        {
          kind: "chase",
          strategy: "CHASE",
          symbol: NIFTY.symbol,
          lots: 1,
          ema: 24000,
          highestHigh: 25010,
        },
      ],
    }),
  "market-resume": () =>
    day(MON, "10:30", "11:30", {
      scenario: "market-resume",
      forcedSession: "OPEN",
      sessionSchedule: [{ at: `${MON} 10:30`, state: null }],
    }),
  flat: () => day(MON, "09:20", "15:00", { scenario: "flat", pricePath: "flat" }),
  uptrend: () => day(MON, "09:20", "15:00", { scenario: "uptrend", pricePath: "uptrend" }),
  downtrend: () => day(MON, "09:20", "15:00", { scenario: "downtrend", pricePath: "downtrend" }),
  sideways: () => day(MON, "09:20", "15:00", { scenario: "sideways", pricePath: "sideways" }),
  choppy: () => day(MON, "09:20", "15:00", { scenario: "choppy", pricePath: "choppy" }),
  breakout: () => day(MON, "09:20", "15:00", { scenario: "breakout", pricePath: "breakout" }),
  reversal: () => day(MON, "09:20", "15:00", { scenario: "reversal", pricePath: "reversal" }),
  "high-volatility": () =>
    day(MON, "09:20", "15:00", {
      scenario: "high-volatility",
      volatility: "high",
      pricePath: "choppy",
    }),
  "low-volatility": () =>
    day(MON, "09:20", "15:00", {
      scenario: "low-volatility",
      volatility: "very_low",
      pricePath: "flat",
    }),
  "volatility-spike": () =>
    day(MON, "09:20", "15:00", {
      scenario: "volatility-spike",
      pricePath: "volatility_spike",
      volatility: "extreme",
    }),
  crash: () =>
    day(MON, "09:20", "15:00", { scenario: "crash", pricePath: "crash", volatility: "extreme" }),
  rally: () => day(MON, "09:20", "15:00", { scenario: "rally", pricePath: "rally" }),
  "gap-up": () => ({
    scenario: "gap-up",
    start: `${MON} 15:20`,
    end: "2026-09-08 10:00",
    seed: 4,
    instruments: [NIFTY],
    pricePath: "gap_up",
    stepMinutes: 20,
  }),
  "gap-down": () => ({
    scenario: "gap-down",
    start: `${MON} 15:20`,
    end: "2026-09-08 10:00",
    seed: 5,
    instruments: [NIFTY],
    pricePath: "gap_down",
    stepMinutes: 20,
  }),
  "chase-gap-down": () => ({
    scenario: "chase-gap-down",
    start: `${MON} 14:00`,
    end: "2026-09-08 10:30",
    seed: 6,
    instruments: [NIFTY],
    pricePath: "gap_down",
    stepMinutes: 15,
    paperRisk: true,
    actors: [
      {
        kind: "chase",
        strategy: "CHASE",
        symbol: NIFTY.symbol,
        lots: 1,
        ema: 20000,
        bufferPercent: 0.2,
      },
    ],
    assertions: [{ type: "max_exposure", maxAbsQty: 130 }],
  }),
  "flash-crash": () =>
    day(MON, "09:20", "12:00", {
      scenario: "flash-crash",
      pricePath: "flash_crash",
      stepMinutes: 2,
    }),
  "flash-rally": () =>
    day(MON, "09:20", "12:00", {
      scenario: "flash-rally",
      pricePath: "flash_rally",
      stepMinutes: 2,
    }),
  "immediate-fill": () =>
    day(MON, "09:20", "10:00", {
      scenario: "immediate-fill",
      liquidity: "high",
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
      ],
      assertions: [{ type: "filled_qty", symbol: NIFTY.symbol, quantity: 65 }],
    }),
  "delayed-fill": () =>
    day(MON, "09:20", "10:30", {
      scenario: "delayed-fill",
      failures: [{ kind: "delayed_fill", at: `${MON} 09:20` }],
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
      ],
    }),
  "partial-fill": () =>
    day(MON, "09:20", "10:30", {
      scenario: "partial-fill",
      liquidity: "very_low",
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 2,
          fireAt: "09:20",
        },
      ],
    }),
  "no-fill": () =>
    day(MON, "09:20", "10:00", {
      scenario: "no-fill",
      liquidity: "very_low",
      defects: [{ at: `${MON} 09:20`, symbol: NIFTY.symbol, defect: "outage" }],
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
      ],
    }),
  rejection: () =>
    day(MON, "09:20", "10:00", {
      scenario: "rejection",
      failures: [{ kind: "none" }],
      risk: { maxQtyPerOrder: 10 },
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
      ],
      assertions: [{ type: "risk_code_seen", code: "MAX_QTY" }],
    }),
  cancellation: () => day(MON, "09:20", "10:00", { scenario: "cancellation" }),
  expiration: () =>
    day(MON, "15:20", "16:00", {
      scenario: "expiration",
      stepMinutes: 1,
    }),
  slippage: () =>
    day(MON, "09:20", "10:00", {
      scenario: "slippage",
      slippage: { mode: "fixed", points: 2 },
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
      ],
    }),
  "wide-spread": () =>
    day(MON, "09:20", "10:00", {
      scenario: "wide-spread",
      spreadPoints: 8,
      liquidity: "very_low",
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
      ],
    }),
  "low-liquidity": () =>
    day(MON, "09:20", "11:00", {
      scenario: "low-liquidity",
      liquidity: "low",
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 3,
          fireAt: "09:20",
        },
      ],
    }),
  "broker-timeout": () =>
    day(MON, "09:20", "10:00", {
      scenario: "broker-timeout",
      failures: [{ kind: "broker_timeout", at: `${MON} 09:20`, until: `${MON} 09:40` }],
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
      ],
    }),
  "broker-unavailable": () =>
    day(MON, "09:20", "10:00", {
      scenario: "broker-unavailable",
      failures: [{ kind: "broker_unavailable", at: `${MON} 09:20`, until: `${MON} 09:50` }],
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
      ],
    }),
  "network-failure": () =>
    day(MON, "09:20", "10:00", {
      scenario: "network-failure",
      failures: [{ kind: "connection_reset", at: `${MON} 09:20`, until: `${MON} 09:35` }],
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
      ],
    }),
  "duplicate-event": () =>
    day(MON, "09:20", "10:00", {
      scenario: "duplicate-event",
      failures: [{ kind: "duplicate_response", at: `${MON} 09:20` }],
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
      ],
      assertions: [{ type: "no_duplicate_fill_qty" }],
    }),
  "delayed-event": () =>
    day(MON, "09:20", "10:30", {
      scenario: "delayed-event",
      failures: [{ kind: "delayed_fill" }],
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
      ],
    }),
  "database-failure": () =>
    day(MON, "09:20", "10:00", {
      scenario: "database-failure",
      failures: [{ kind: "database_down" }],
    }),
  "redis-failure": () =>
    day(MON, "09:20", "10:00", { scenario: "redis-failure", failures: [{ kind: "redis_down" }] }),
  "worker-crash": () =>
    day(MON, "09:20", "10:00", {
      scenario: "worker-crash",
      failures: [{ kind: "worker_crash", at: `${MON} 09:25`, until: `${MON} 09:30` }],
    }),
  "application-restart": () =>
    day(MON, "09:20", "11:00", {
      scenario: "application-restart",
      restartAt: `${MON} 10:00`,
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
      ],
      assertions: [{ type: "recovered_qty", symbol: NIFTY.symbol, quantity: -65 }],
    }),
  "reconciliation-mismatch": () =>
    day(MON, "09:20", "10:30", {
      scenario: "reconciliation-mismatch",
      failures: [{ kind: "incorrect_response", at: `${MON} 09:20`, until: `${MON} 09:25` }],
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
      ],
    }),
  "normal-signal": () =>
    day(MON, "09:20", "11:00", {
      scenario: "normal-signal",
      actors: [
        {
          kind: "chase",
          strategy: "CHASE",
          symbol: NIFTY.symbol,
          lots: 1,
          ema: 24000,
          bufferPercent: 0.2,
          highestHigh: 25010,
        },
      ],
      assertions: [{ type: "order_count", min: 1 }],
    }),
  "repeated-signal": () =>
    day(MON, "09:20", "12:00", {
      scenario: "repeated-signal",
      stepMinutes: 2,
      actors: [
        {
          kind: "chase",
          strategy: "CHASE",
          symbol: NIFTY.symbol,
          lots: 1,
          ema: 24000,
          highestHigh: 25010,
        },
      ],
    }),
  "signal-oscillation": () =>
    day(MON, "09:20", "12:00", {
      scenario: "signal-oscillation",
      pricePath: "choppy",
      volatility: "high",
      actors: [{ kind: "chase", strategy: "CHASE", symbol: NIFTY.symbol, lots: 1, ema: 25000 }],
    }),
  "conflicting-signals": () =>
    day(MON, "09:20", "11:00", {
      scenario: "conflicting-signals",
      instruments: [NIFTY],
      actors: [
        {
          kind: "chase",
          strategy: "CHASE",
          symbol: NIFTY.symbol,
          lots: 1,
          ema: 24000,
          highestHigh: 25010,
        },
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
      ],
    }),
  "entry-exit-collision": () =>
    day(MON, "09:20", "11:00", {
      scenario: "entry-exit-collision",
      pricePath: "flash_crash",
      actors: [{ kind: "chase", strategy: "CHASE", symbol: NIFTY.symbol, lots: 1, ema: 24000 }],
    }),
  "strategy-disabled": () =>
    day(MON, "09:20", "10:00", {
      scenario: "strategy-disabled",
      risk: {
        strategies: {
          ...DEFAULT_STRATS(),
          ATM_STRADDLE: { ...DEFAULT_STRATS().ATM_STRADDLE, enabled: false },
        },
      },
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
      ],
      assertions: [{ type: "risk_code_seen", code: "STRATEGY_DISABLED" }],
    }),
  "strategy-paused": () =>
    day(MON, "09:20", "10:30", {
      scenario: "strategy-paused",
      actors: [
        {
          kind: "chase",
          strategy: "CHASE",
          symbol: NIFTY.symbol,
          lots: 1,
          ema: 24000,
          paused: true,
        },
      ],
      assertions: [{ type: "no_orders" }],
    }),
  "risk-limit-reached": () =>
    day(MON, "09:20", "10:00", {
      scenario: "risk-limit-reached",
      risk: { maxNotionalInr: 100 },
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
      ],
      assertions: [{ type: "risk_code_seen", code: "MAX_NOTIONAL" }],
    }),
  "drawdown-reached": () =>
    day(MON, "09:20", "10:00", {
      scenario: "drawdown-reached",
      risk: {
        strategies: {
          ...DEFAULT_STRATS(),
          ATM_STRADDLE: { ...DEFAULT_STRATS().ATM_STRADDLE, maxDrawdownPct: 0 },
        },
      },
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
      ],
    }),
  "multiple-positions": () =>
    day(MON, "09:20", "11:00", {
      scenario: "multiple-positions",
      instruments: [NIFTY, BANK],
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
        {
          kind: "strangle",
          strategy: "ATM_STRANGLE",
          symbol: BANK.symbol,
          lots: 1,
          fireAt: "09:25",
        },
      ],
    }),
  "multiple-strategies": () =>
    day(MON, "09:20", "11:00", {
      scenario: "multiple-strategies",
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
        { kind: "chase", strategy: "CHASE", symbol: NIFTY.symbol, lots: 1, ema: 24000 },
      ],
    }),
  "correlated-positions": () =>
    day(MON, "09:20", "11:00", {
      scenario: "correlated-positions",
      instruments: [NIFTY, BANK],
      pricePath: "crash",
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
        {
          kind: "strangle",
          strategy: "ATM_STRANGLE",
          symbol: BANK.symbol,
          lots: 1,
          fireAt: "09:20",
        },
      ],
    }),
  "cash-constraint": () =>
    day(MON, "09:20", "10:00", {
      scenario: "cash-constraint",
      risk: { maxNotionalInr: 50_000 },
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 2,
          fireAt: "09:20",
        },
      ],
    }),
  "exposure-limit": () =>
    day(MON, "09:20", "10:00", {
      scenario: "exposure-limit",
      risk: { maxQtyPerOrder: 50 },
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
      ],
      assertions: [{ type: "risk_code_seen", code: "MAX_QTY" }],
    }),
  "maximum-position": () =>
    day(MON, "09:20", "10:00", {
      scenario: "maximum-position",
      risk: {
        strategies: {
          ...DEFAULT_STRATS(),
          ATM_STRADDLE: { ...DEFAULT_STRATS().ATM_STRADDLE, maxOpenPositions: 0 },
        },
      },
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
      ],
      assertions: [{ type: "risk_code_seen", code: "MAX_POSITIONS" }],
    }),
  "portfolio-drawdown": () =>
    day(MON, "09:20", "15:00", {
      scenario: "portfolio-drawdown",
      pricePath: "crash",
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
      ],
    }),
  "simultaneous-signals": () =>
    day(MON, "09:20", "10:30", {
      scenario: "simultaneous-signals",
      instruments: [NIFTY, BANK],
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: NIFTY.symbol,
          lots: 1,
          fireAt: "09:20",
        },
        {
          kind: "strangle",
          strategy: "ATM_STRANGLE",
          symbol: BANK.symbol,
          lots: 1,
          fireAt: "09:20",
        },
        { kind: "chase", strategy: "CHASE", symbol: NIFTY.symbol, lots: 1, ema: 24000 },
      ],
    }),
  random: () =>
    day(MON, "09:15", "15:30", {
      scenario: "random",
      seed: 12345,
      pricePath: "choppy",
      volatility: "high",
      liquidity: "low",
      actors: [{ kind: "chase", strategy: "CHASE", symbol: NIFTY.symbol, lots: 1, ema: 25000 }],
    }),
}

function DEFAULT_STRATS() {
  return DEFAULT_RISK_SETTINGS.strategies
}

export const SCENARIO_IDS = Object.keys(NAMED).sort()

export const SCENARIO_ALIASES: Record<string, string> = {
  "normal-trading-day": "normal-day",
  flash_crash: "flash-crash",
  broker_timeout: "broker-timeout",
  gap_down: "gap-down",
  gap_up: "gap-up",
}

export function resolveScenario(
  input: Partial<SimulateConfig> & { scenario?: string }
): SimulateConfig {
  const raw = input.scenario ?? "normal-day"
  const id = SCENARIO_ALIASES[raw] ?? raw
  const factory = NAMED[id]
  const named = factory ? factory() : day(MON, "09:15", "15:30", { scenario: id })
  return {
    ...named,
    ...input,
    scenario: input.scenario ?? named.scenario,
    instruments: input.instruments ?? named.instruments,
    actors: input.actors ?? named.actors,
    assertions: input.assertions ?? named.assertions,
    failures: input.failures ?? named.failures,
    calendar: input.calendar ?? named.calendar,
    risk: input.risk ?? named.risk,
    seed: input.seed ?? named.seed,
    start: input.start ?? named.start,
    end: input.end ?? named.end,
  }
}

export function listScenarios(): string[] {
  return SCENARIO_IDS
}
