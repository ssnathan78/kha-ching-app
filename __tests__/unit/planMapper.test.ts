import { formatFormDataForApi } from "../../lib/browserUtils"
import { STRATEGIES, STRATEGIES_DETAILS } from "../../lib/constants"
import {
  coerceLots,
  coercePlanName,
  mapPlanFromDb,
  mapPlanToDb,
  planApiErrorMessage,
} from "../../lib/planMapper"
import type { ATM_STRANGLE_CONFIG } from "../../types/plans"

describe("coercePlanName / coerceLots", () => {
  it("fills strategy labels when the template name is blank", () => {
    expect(coercePlanName(undefined, "ATM_STRANGLE")).toBe("ATM Strangle")
    expect(coercePlanName("  ", "ATM_STRADDLE")).toBe("ATM Straddle")
    expect(coercePlanName("Tuesday Nifty", "ATM_STRANGLE")).toBe("Tuesday Nifty")
  })

  it("never returns a non-positive lots value", () => {
    expect(coerceLots(undefined)).toBe(1)
    expect(coerceLots(null)).toBe(1)
    expect(coerceLots(Number.NaN)).toBe(1)
    expect(coerceLots(0)).toBe(1)
    expect(coerceLots(-2)).toBe(1)
    expect(coerceLots("3.9")).toBe(3)
    expect(coerceLots(2)).toBe(2)
  })
})

describe("mapPlanToDb", () => {
  it("saves a Tuesday strangle when name and lots are missing (the failing UI payload)", () => {
    const mapped = mapPlanToDb(
      {
        strategy: "ATM_STRANGLE",
        instrument: "NIFTY",
        expiryType: "CURRENT",
        productType: "MIS",
        exitStrategy: "NO_SL",
        combinedExitStrategy: "EXIT_ALL",
        runAt: "2026-09-05T06:50:00.000Z",
        squareOffTime: "2026-09-05T09:50:56.000Z",
        lots: null,
        slmPercent: null,
        slOrderType: "SLL",
        slLimitPricePercent: 1,
        volatilityType: "SHORT",
        trailEveryPercentageChangeValue: 2,
        isAutoSquareOffEnabled: true,
        autoSquareOffTime: "2026-09-05T09:50:56.000Z",
      },
      "TUESDAY"
    )

    expect(mapped.dayOfWeek).toBe("TUESDAY")
    expect(mapped.strategy).toBe("ATM_STRANGLE")
    expect(mapped.name).toBe("ATM Strangle")
    expect(mapped.lots).toBe(1)
    expect(mapped.instrument).toBe("NIFTY")
    expect(mapped).not.toHaveProperty("slmPercent")
  })

  it("saves a Monday straddle when lots is JSON-null (NaN from Number(undefined))", () => {
    const mapped = mapPlanToDb(
      {
        name: "a",
        strategy: "ATM_STRADDLE",
        instrument: "NIFTY",
        expiryType: "CURRENT",
        productType: "MIS",
        lots: null,
        slOrderType: "SLL",
        slLimitPricePercent: 1,
        volatilityType: "SHORT",
      },
      "MONDAY"
    )

    expect(mapped.name).toBe("a")
    expect(mapped.lots).toBe(1)
    expect(mapped.dayOfWeek).toBe("MONDAY")
  })

  it("drops NaN numerics instead of sending them to Postgres", () => {
    const mapped = mapPlanToDb({
      name: "x",
      strategy: "ATM_STRADDLE",
      instrument: "NIFTY",
      expiryType: "CURRENT",
      productType: "MIS",
      lots: Number.NaN,
      slmPercent: Number.NaN,
    })
    expect(mapped.lots).toBe(1)
    expect(mapped).not.toHaveProperty("slmPercent")
  })

  it("keeps strangle entry fields in extras so the plan page can render labels", () => {
    const mapped = mapPlanToDb({
      strategy: "ATM_STRANGLE",
      instrument: "NIFTY",
      expiryType: "CURRENT",
      productType: "MIS",
      lots: 1,
      inverted: true,
      entryStrategy: "DISTANCE_FROM_ATM",
      distanceFromAtm: 4,
    })
    expect(mapped.extras).toEqual(
      expect.objectContaining({
        inverted: true,
        entryStrategy: "DISTANCE_FROM_ATM",
        distanceFromAtm: 4,
      })
    )
    const fromDb = mapPlanFromDb({
      ...mapped,
      extras: mapped.extras,
      autoSquareOffTime: null,
    })
    expect(fromDb.entryStrategy).toBe("DISTANCE_FROM_ATM")
    expect(fromDb.inverted).toBe(true)
    expect(fromDb).not.toHaveProperty("extras")
  })
})

describe("planApiErrorMessage", () => {
  it("does not dump the raw SQL insert to the operator", () => {
    expect(
      planApiErrorMessage({
        message: 'Failed query: insert into "trade_plans"',
        cause: { code: "23502", column: "name" },
      })
    ).toBe("Give the template a name before saving.")
    expect(
      planApiErrorMessage({
        message: "Failed query",
        cause: { code: "23502", column: "lots" },
      })
    ).toBe("Lots must be at least 1.")
  })
})

describe("intraday form defaults", () => {
  it.each([STRATEGIES.ATM_STRADDLE, STRATEGIES.ATM_STRANGLE] as const)(
    "%s ships a name and a positive integer lots",
    strategy => {
      const defaults = STRATEGIES_DETAILS[strategy].defaultFormState
      expect(String(defaults.name).length).toBeGreaterThan(2)
      expect(Number.isInteger(defaults.lots)).toBe(true)
      expect(defaults.lots).toBeGreaterThanOrEqual(1)
    }
  )
})

describe("formatFormDataForApi", () => {
  it("fills name and lots for a strangle with an empty label and missing lots", () => {
    const data = {
      ...STRATEGIES_DETAILS[STRATEGIES.ATM_STRANGLE].defaultFormState,
      name: "",
      lots: undefined,
      strategy: STRATEGIES.ATM_STRANGLE,
      instrument: "NIFTY",
      instruments: { NIFTY: true, BANKNIFTY: false, FINNIFTY: false },
      runAt: STRATEGIES_DETAILS[STRATEGIES.ATM_STRANGLE].defaultRunAt,
      squareOffTime: new Date().toISOString(),
      isAutoSquareOffEnabled: true,
    } as unknown as ATM_STRANGLE_CONFIG

    const api = formatFormDataForApi({ strategy: STRATEGIES.ATM_STRANGLE, data })
    expect(api?.name).toBe("ATM Strangle")
    expect(api?.lots).toBe(1)
  })
})
