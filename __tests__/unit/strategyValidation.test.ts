import {
  EXIT_STRATEGIES,
  INSTRUMENTS,
  STRANGLE_ENTRY_STRATEGIES,
  STRATEGIES,
} from "../../lib/constants"
import {
  EXIT_STRATEGIES_ALLOWED_AT_SCHEDULE,
  shouldEnqueueExitQueue,
  validateExitStrategy,
  validateInstrumentForStrategy,
  validateLots,
  validateNoSlExit,
  validateSlmPercent,
  validateStrangleEntry,
  validateStrategyEnum,
  validateTradeJobPayload,
} from "../../lib/strategyValidation"
import { baseStraddleJob, baseStrangleJob } from "../support/jobFixtures"

describe("validateExitStrategy", () => {
  it.each(Array.from(EXIT_STRATEGIES_ALLOWED_AT_SCHEDULE))("allows %s", strategy => {
    expect(validateExitStrategy(strategy).ok).toBe(true)
  })

  it.each([
    EXIT_STRATEGIES.MULTI_LEG_PREMIUM_THRESHOLD,
    EXIT_STRATEGIES.MIN_XPERCENT_OR_SUPERTREND,
    EXIT_STRATEGIES.OBS_TRAIL_SL,
  ])("rejects unimplemented %s (trader harm)", strategy => {
    const result = validateExitStrategy(strategy)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("not implemented")
  })

  it("rejects missing exit strategy", () => {
    expect(validateExitStrategy(undefined).ok).toBe(false)
  })
})

describe("validateInstrumentForStrategy", () => {
  it("strangle rejects FINNIFTY", () => {
    const r = validateInstrumentForStrategy(STRATEGIES.ATM_STRANGLE, INSTRUMENTS.FINNIFTY)
    expect(r.ok).toBe(false)
  })

  it("straddle allows FINNIFTY", () => {
    expect(validateInstrumentForStrategy(STRATEGIES.ATM_STRADDLE, INSTRUMENTS.FINNIFTY).ok).toBe(
      true
    )
  })
})

describe("validateLots", () => {
  it.each([0, -1, 1.5, NaN, null])("rejects invalid lots %p", lots => {
    expect(validateLots(lots).ok).toBe(false)
  })

  it.each([1, 2, 100])("accepts valid lots %p", lots => {
    expect(validateLots(lots).ok).toBe(true)
  })

  it("rejects lots above the configured Desk risk cap", () => {
    expect(validateLots(21, 20).ok).toBe(false)
    expect(validateLots(20, 20).ok).toBe(true)
  })
})

describe("validateSlmPercent", () => {
  it("skips when NO_SL", () => {
    expect(validateSlmPercent(undefined, EXIT_STRATEGIES.NO_SL).ok).toBe(true)
  })

  it.each([0, -5, 201])("rejects dangerous slm %p", slm => {
    expect(validateSlmPercent(slm, EXIT_STRATEGIES.INDIVIDUAL_LEG_SLM_1X).ok).toBe(false)
  })

  it.each([1, 30, 100])("accepts slm %p", slm => {
    expect(validateSlmPercent(slm, EXIT_STRATEGIES.INDIVIDUAL_LEG_SLM_1X).ok).toBe(true)
  })
})

describe("validateStrangleEntry", () => {
  it.each([0, -1, 51])("rejects distance %p", d => {
    expect(
      validateStrangleEntry(STRANGLE_ENTRY_STRATEGIES.DISTANCE_FROM_ATM, { distanceFromAtm: d }).ok
    ).toBe(false)
  })

  it.each([0, -1, 51])("rejects percent %p", p => {
    expect(
      validateStrangleEntry(STRANGLE_ENTRY_STRATEGIES.PERCENT_FROM_ATM, { percentfromAtm: p }).ok
    ).toBe(false)
  })

  it("rejects zero entry price", () => {
    expect(
      validateStrangleEntry(STRANGLE_ENTRY_STRATEGIES.ENTRY_PRICE, { optionPrice: 0 }).ok
    ).toBe(false)
  })
})

describe("validateNoSlExit", () => {
  it("requires auto square-off when NO_SL", () => {
    expect(validateNoSlExit(EXIT_STRATEGIES.NO_SL, true).ok).toBe(true)
    expect(validateNoSlExit(EXIT_STRATEGIES.NO_SL, false).ok).toBe(false)
    expect(validateNoSlExit(EXIT_STRATEGIES.INDIVIDUAL_LEG_SLM_1X, false).ok).toBe(true)
  })
})

describe("validateTradeJobPayload", () => {
  it("rejects NO_SL without auto square-off", () => {
    const job = baseStrangleJob({
      exitStrategy: EXIT_STRATEGIES.NO_SL,
      isAutoSquareOffEnabled: false,
    })
    expect(validateTradeJobPayload(job).ok).toBe(false)
  })

  it("accepts valid straddle", () => {
    expect(validateTradeJobPayload(baseStraddleJob()).ok).toBe(true)
  })

  it("accepts valid strangle", () => {
    expect(validateTradeJobPayload(baseStrangleJob()).ok).toBe(true)
  })

  it("rejects premium threshold exit on straddle (BUG-001 regression)", () => {
    const job = baseStraddleJob({ exitStrategy: EXIT_STRATEGIES.MULTI_LEG_PREMIUM_THRESHOLD })
    expect(validateTradeJobPayload(job).ok).toBe(false)
  })

  it("rejects strangle on FINNIFTY", () => {
    const job = baseStrangleJob({ instrument: INSTRUMENTS.FINNIFTY })
    expect(validateTradeJobPayload(job).ok).toBe(false)
  })

  it("rejects inverted skew thresholds", () => {
    const job = baseStraddleJob({ maxSkewPercent: 30, thresholdSkewPercent: 10 })
    expect(validateTradeJobPayload(job).ok).toBe(false)
  })
})

describe("validateStrategyEnum", () => {
  it.each([STRATEGIES.ATM_STRADDLE, STRATEGIES.ATM_STRANGLE, STRATEGIES.SUBSCRIBE_CHASE])(
    "allows %s",
    strategy => {
      expect(validateStrategyEnum(strategy).ok).toBe(true)
    }
  )

  it("rejects unknown strategy", () => {
    const result = validateStrategyEnum("FAKE_STRATEGY")
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("Invalid strategy")
  })

  it("rejects missing strategy", () => {
    expect(validateStrategyEnum(undefined).ok).toBe(false)
  })
})

describe("shouldEnqueueExitQueue", () => {
  it("true for individual leg SL", () => {
    expect(shouldEnqueueExitQueue(EXIT_STRATEGIES.INDIVIDUAL_LEG_SLM_1X)).toBe(true)
  })

  it("false for NO_SL", () => {
    expect(shouldEnqueueExitQueue(EXIT_STRATEGIES.NO_SL)).toBe(false)
  })
})
