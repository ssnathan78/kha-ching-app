import { futurePlansToSchedule, PAST_PLAN_SCHEDULE_ERROR } from "../../lib/planDashSchedule"

describe("futurePlansToSchedule", () => {
  const now = "2026-09-06T09:30:00+05:30"

  it("keeps plans whose runAt is still in the future", () => {
    const kept = futurePlansToSchedule(
      [
        { id: "past", runAt: "2026-09-06T09:00:00+05:30" },
        { id: "future", runAt: "2026-09-06T12:20:00+05:30" },
      ],
      now
    )
    expect(kept.map(p => p.id)).toEqual(["future"])
  })

  it("returns empty when every template time has passed", () => {
    expect(futurePlansToSchedule([{ runAt: "2026-09-06T08:00:00+05:30" }], now)).toEqual([])
  })

  it("treats a missing list as nothing to schedule", () => {
    expect(futurePlansToSchedule(null, now)).toEqual([])
    expect(futurePlansToSchedule(undefined, now)).toEqual([])
  })

  it("exports the PlanDash banner copy", () => {
    expect(PAST_PLAN_SCHEDULE_ERROR).toMatch(/already passed/)
  })
})
