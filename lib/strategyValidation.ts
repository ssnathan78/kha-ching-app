import type { SUPPORTED_TRADE_CONFIG } from "../types/trade"
import { EXIT_STRATEGIES, INSTRUMENTS, STRANGLE_ENTRY_STRATEGIES, STRATEGIES } from "./constants"

/** Exit modes the exitTradingQueue worker actually places orders for. */
export const EXIT_STRATEGIES_WITH_QUEUE_HANDLER = new Set<string>([
  EXIT_STRATEGIES.INDIVIDUAL_LEG_SLM_1X,
])

/** Safe to schedule: explicit no SL, or handler exists. */
export const EXIT_STRATEGIES_ALLOWED_AT_SCHEDULE = new Set<string>([
  EXIT_STRATEGIES.INDIVIDUAL_LEG_SLM_1X,
  EXIT_STRATEGIES.NO_SL,
])

const STRATEGY_INSTRUMENTS: Record<string, Set<string>> = {
  [STRATEGIES.ATM_STRADDLE]: new Set([
    INSTRUMENTS.NIFTY,
    INSTRUMENTS.BANKNIFTY,
    INSTRUMENTS.FINNIFTY,
  ]),
  [STRATEGIES.ATM_STRANGLE]: new Set([INSTRUMENTS.NIFTY, INSTRUMENTS.BANKNIFTY]),
}

export type TradeValidationResult = { ok: true } | { ok: false; error: string }

export function validateExitStrategy(exitStrategy?: string | null): TradeValidationResult {
  if (!exitStrategy) {
    return { ok: false, error: "exitStrategy is required" }
  }
  if (!EXIT_STRATEGIES_ALLOWED_AT_SCHEDULE.has(exitStrategy)) {
    return {
      ok: false,
      error: `Exit strategy "${exitStrategy}" is not implemented yet. Use INDIVIDUAL_LEG_SLM_1X or NO_SL.`,
    }
  }
  return { ok: true }
}

export function validateInstrumentForStrategy(
  strategy: string,
  instrument: string
): TradeValidationResult {
  const allowed = STRATEGY_INSTRUMENTS[strategy]
  if (!allowed) {
    return { ok: true }
  }
  if (!allowed.has(instrument as INSTRUMENTS)) {
    return {
      ok: false,
      error: `${instrument} is not supported for ${strategy}. Allowed: ${Array.from(allowed).join(", ")}`,
    }
  }
  return { ok: true }
}

export function validateLots(lots: unknown, maxLots?: number): TradeValidationResult {
  const n = Number(lots)
  if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
    return { ok: false, error: "lots must be an integer >= 1" }
  }
  if (maxLots != null && n > maxLots) {
    return { ok: false, error: `lots exceeds the Desk → Risk cap of ${maxLots}` }
  }
  return { ok: true }
}

export function validateNoSlExit(
  exitStrategy: string | undefined,
  isAutoSquareOffEnabled: unknown
): TradeValidationResult {
  if (exitStrategy !== EXIT_STRATEGIES.NO_SL) {
    return { ok: true }
  }
  if (isAutoSquareOffEnabled !== true) {
    return {
      ok: false,
      error: "NO_SL requires auto square-off. Enable time square-off or choose a stop-loss exit.",
    }
  }
  return { ok: true }
}

export function validateSlmPercent(
  slmPercent: unknown,
  exitStrategy: string
): TradeValidationResult {
  if (exitStrategy === EXIT_STRATEGIES.NO_SL) {
    return { ok: true }
  }
  const n = Number(slmPercent)
  if (!Number.isFinite(n) || n <= 0 || n > 200) {
    return { ok: false, error: "slmPercent must be between 0 and 200 when using stop-loss exits" }
  }
  return { ok: true }
}

export function validateStrangleEntry(
  entryStrategy: string,
  fields: {
    distanceFromAtm?: number
    percentfromAtm?: number
    optionPrice?: number
  }
): TradeValidationResult {
  if (entryStrategy === STRANGLE_ENTRY_STRATEGIES.DISTANCE_FROM_ATM) {
    const d = Number(fields.distanceFromAtm)
    if (!Number.isFinite(d) || d < 1 || d > 50) {
      return { ok: false, error: "distanceFromAtm must be between 1 and 50 strikes" }
    }
  }
  if (entryStrategy === STRANGLE_ENTRY_STRATEGIES.PERCENT_FROM_ATM) {
    const p = Number(fields.percentfromAtm)
    if (!Number.isFinite(p) || p <= 0 || p > 50) {
      return { ok: false, error: "percentfromAtm must be between 0 and 50" }
    }
  }
  if (entryStrategy === STRANGLE_ENTRY_STRATEGIES.ENTRY_PRICE) {
    const price = Number(fields.optionPrice)
    if (!Number.isFinite(price) || price <= 0) {
      return { ok: false, error: "optionPrice must be a positive number for entry-by-price" }
    }
  }
  return { ok: true }
}

export function validatePlanConfig(
  config: Record<string, unknown> = {},
  opts?: { maxLots?: number }
): TradeValidationResult {
  const strategy = config.strategy as string | undefined
  if (!strategy) {
    return { ok: false, error: "strategy is required" }
  }

  const instrument = config.instrument as string | undefined
  if (instrument) {
    const inst = validateInstrumentForStrategy(strategy, instrument)
    if (!inst.ok) return inst
  }

  const lotsCheck = validateLots(config.lots, opts?.maxLots)
  if (!lotsCheck.ok) return lotsCheck

  const exitStrategy = config.exitStrategy as string | undefined
  const exitCheck = validateExitStrategy(exitStrategy)
  if (!exitCheck.ok) return exitCheck

  const slmCheck = validateSlmPercent(config.slmPercent, exitStrategy!)
  if (!slmCheck.ok) return slmCheck

  const noSlCheck = validateNoSlExit(exitStrategy, config.isAutoSquareOffEnabled)
  if (!noSlCheck.ok) return noSlCheck

  if (strategy === STRATEGIES.ATM_STRANGLE) {
    const entry = validateStrangleEntry(
      (config.entryStrategy as string) ?? STRANGLE_ENTRY_STRATEGIES.DISTANCE_FROM_ATM,
      config as {
        distanceFromAtm?: number
        percentfromAtm?: number
        optionPrice?: number
      }
    )
    if (!entry.ok) return entry
  }

  if (strategy === STRATEGIES.ATM_STRADDLE) {
    const maxSkew = Number(config.maxSkewPercent)
    const threshold = Number(config.thresholdSkewPercent)
    if (Number.isFinite(maxSkew) && Number.isFinite(threshold) && threshold < maxSkew) {
      return {
        ok: false,
        error: "thresholdSkewPercent must be >= maxSkewPercent (threshold is the relaxed ceiling)",
      }
    }
  }

  return { ok: true }
}

const SCHEDULABLE_STRATEGIES = new Set<string>([
  STRATEGIES.ATM_STRADDLE,
  STRATEGIES.ATM_STRANGLE,
  STRATEGIES.SUBSCRIBE_CHASE,
])

export function validateStrategyEnum(strategy?: string | null): TradeValidationResult {
  if (!strategy) {
    return { ok: false, error: "strategy is required" }
  }
  if (!SCHEDULABLE_STRATEGIES.has(strategy)) {
    return { ok: false, error: `Invalid strategy "${strategy}"` }
  }
  return { ok: true }
}

export function validateTradeJobPayload(
  body: Partial<SUPPORTED_TRADE_CONFIG>,
  opts?: { maxLots?: number }
): TradeValidationResult {
  const strategy = body.strategy as string | undefined
  const strategyCheck = validateStrategyEnum(strategy)
  if (!strategyCheck.ok || !strategy) return strategyCheck

  const instrument = (body as { instrument?: string }).instrument
  if (instrument) {
    const inst = validateInstrumentForStrategy(strategy, instrument)
    if (!inst.ok) return inst
  }

  const lotsCheck = validateLots((body as { lots?: number }).lots, opts?.maxLots)
  if (!lotsCheck.ok) return lotsCheck

  const exitStrategy = (body as { exitStrategy?: string }).exitStrategy
  const exitCheck = validateExitStrategy(exitStrategy)
  if (!exitCheck.ok) return exitCheck

  const slmCheck = validateSlmPercent((body as { slmPercent?: number }).slmPercent, exitStrategy!)
  if (!slmCheck.ok) return slmCheck

  const noSlCheck = validateNoSlExit(
    exitStrategy,
    (body as { isAutoSquareOffEnabled?: boolean }).isAutoSquareOffEnabled
  )
  if (!noSlCheck.ok) return noSlCheck

  if (strategy === STRATEGIES.ATM_STRANGLE) {
    const entry = validateStrangleEntry(
      (body as { entryStrategy?: string }).entryStrategy ??
        STRANGLE_ENTRY_STRATEGIES.DISTANCE_FROM_ATM,
      body as any
    )
    if (!entry.ok) return entry
  }

  if (strategy === STRATEGIES.ATM_STRADDLE) {
    const maxSkew = Number((body as { maxSkewPercent?: number }).maxSkewPercent)
    const threshold = Number((body as { thresholdSkewPercent?: number }).thresholdSkewPercent)
    if (Number.isFinite(maxSkew) && Number.isFinite(threshold) && threshold < maxSkew) {
      return {
        ok: false,
        error: "thresholdSkewPercent must be >= maxSkewPercent (threshold is the relaxed ceiling)",
      }
    }
  }

  return { ok: true }
}

export function shouldEnqueueExitQueue(exitStrategy?: string | null): boolean {
  return Boolean(exitStrategy && EXIT_STRATEGIES_WITH_QUEUE_HANDLER.has(exitStrategy))
}
