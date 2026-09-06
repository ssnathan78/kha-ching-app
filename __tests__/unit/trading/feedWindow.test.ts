import {
  isHiddenByClears,
  istTodayBounds,
  parseFeedClearMode,
  parseFeedPeriod,
  periodBounds,
  shouldSampleSkewAttempt,
} from "../../../lib/trading/feedWindow"

describe("feedWindow", () => {
  const sunday = new Date("2026-09-06T08:00:00+05:30")

  it("samples the first and every 25th skew attempt", () => {
    expect(shouldSampleSkewAttempt(0)).toBe(true)
    expect(shouldSampleSkewAttempt(1)).toBe(false)
    expect(shouldSampleSkewAttempt(25)).toBe(true)
  })

  it("parses period and clear mode", () => {
    expect(parseFeedPeriod("today")).toBe("today")
    expect(parseFeedPeriod("nope")).toBe("all")
    expect(parseFeedClearMode("before_today")).toBe("before_today")
    expect(parseFeedClearMode("x")).toBeNull()
  })

  it("bounds today and before today in IST", () => {
    const { start, end, istDate } = istTodayBounds(sunday)
    expect(istDate).toBe("2026-09-06")
    expect(periodBounds("today", sunday)).toEqual({ from: start, to: end })
    expect(periodBounds("before_today", sunday).to).toEqual(start)
    expect(periodBounds("all", sunday)).toEqual({ from: undefined, to: undefined })
  })

  it("hides rows covered by clear-all / today / before-today", () => {
    const morning = new Date("2026-09-06T04:00:00+05:30")
    const yesterday = new Date("2026-09-05T10:00:00+05:30")
    expect(
      isHiddenByClears(
        morning,
        [{ mode: "all", before: new Date("2026-09-06T09:00:00+05:30") }],
        sunday
      )
    ).toBe(true)
    expect(isHiddenByClears(morning, [{ mode: "today", istDate: "2026-09-06" }], sunday)).toBe(true)
    expect(
      isHiddenByClears(
        new Date("2026-09-06T10:00:00+05:30"),
        [{ mode: "today", istDate: "2026-09-06", before: new Date("2026-09-06T09:00:00+05:30") }],
        sunday
      )
    ).toBe(false)
    expect(
      isHiddenByClears(
        yesterday,
        [{ mode: "before_today", before: istTodayBounds(sunday).start }],
        sunday
      )
    ).toBe(true)
    expect(
      isHiddenByClears(
        morning,
        [{ mode: "before_today", before: istTodayBounds(sunday).start }],
        sunday
      )
    ).toBe(false)
  })
})
