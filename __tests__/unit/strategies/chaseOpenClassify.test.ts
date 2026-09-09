import { CHASE_OPEN_CLASSIFY } from "../../../lib/chaseDefaults"
import {
  normalizeChaseOpenClassify,
  resolveChaseMorningSnapshot,
} from "../../../lib/chaseOpenClassify"

describe("normalizeChaseOpenClassify", () => {
  it("defaults unknown values to the PDF 09:16 classifier", () => {
    expect(normalizeChaseOpenClassify(undefined)).toBe(CHASE_OPEN_CLASSIFY.PDF_0916)
    expect(normalizeChaseOpenClassify("nope")).toBe(CHASE_OPEN_CLASSIFY.PDF_0916)
    expect(normalizeChaseOpenClassify(CHASE_OPEN_CLASSIFY.LEGACY_60M)).toBe(
      CHASE_OPEN_CLASSIFY.LEGACY_60M
    )
  })
})

describe("resolveChaseMorningSnapshot", () => {
  const overnightEma = 24000
  const longT1 = Math.round(1.004 * overnightEma)
  const shortT1 = Math.round(0.996 * overnightEma)

  const sessionThroughTrend = [{ high: 24120, low: 24080, close: 24110 }]
  const hourlyStubAgainstTrend = {
    ema: 24040,
    lastClose: 23880,
    lowestLow: 23850,
    highestHigh: 24100,
  }

  it("PDF uses overnight EMA and 09:16 session close, not the 60-minute stub", () => {
    const pdf = resolveChaseMorningSnapshot({
      openClassify: CHASE_OPEN_CLASSIFY.PDF_0916,
      overnightEma,
      steppedHourly: hourlyStubAgainstTrend,
      sessionBars: sessionThroughTrend,
    })
    expect(pdf).toEqual({
      ema: 24000,
      lastClose: 24110,
      highestHigh: 24120,
      lowestLow: 24080,
    })
    expect(pdf!.lastClose).toBeGreaterThanOrEqual(longT1)
    expect(hourlyStubAgainstTrend.lastClose).toBeLessThanOrEqual(shortT1)
  })

  it("legacy keeps the stepped 60-minute snapshot even when session bars disagree", () => {
    const legacy = resolveChaseMorningSnapshot({
      openClassify: CHASE_OPEN_CLASSIFY.LEGACY_60M,
      overnightEma,
      steppedHourly: hourlyStubAgainstTrend,
      sessionBars: sessionThroughTrend,
    })
    expect(legacy).toEqual(hourlyStubAgainstTrend)
  })

  it("PDF fail-closes when session bars are missing (does not fall back to hourly)", () => {
    expect(
      resolveChaseMorningSnapshot({
        openClassify: CHASE_OPEN_CLASSIFY.PDF_0916,
        overnightEma,
        steppedHourly: hourlyStubAgainstTrend,
        sessionBars: [],
      })
    ).toBeNull()
  })

  it("legacy fail-closes when the 60-minute step is missing", () => {
    expect(
      resolveChaseMorningSnapshot({
        openClassify: CHASE_OPEN_CLASSIFY.LEGACY_60M,
        overnightEma,
        steppedHourly: null,
        sessionBars: sessionThroughTrend,
      })
    ).toBeNull()
  })

  it("PDF day's high/low till 09:16 come from session bars, ceiled/floored", () => {
    const pdf = resolveChaseMorningSnapshot({
      openClassify: CHASE_OPEN_CLASSIFY.PDF_0916,
      overnightEma,
      steppedHourly: null,
      sessionBars: [
        { high: 24010.4, low: 23990.2, close: 24000 },
        { high: 24022.1, low: 23988.8, close: 24005.6 },
      ],
    })
    expect(pdf).toEqual({
      ema: 24000,
      lastClose: 24006,
      highestHigh: 24023,
      lowestLow: 23988,
    })
  })
})
