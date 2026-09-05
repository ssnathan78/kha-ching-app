import { USER_OVERRIDE } from "../../lib/constants"
import {
  dashboardJobActions,
  isJobAborted,
  jobExecutionPatchFromBody,
  jobMatchesKillScope,
  toClientJobExecution,
} from "../../lib/dashboardJobActions"

describe("jobExecutionPatchFromBody", () => {
  it("maps the dashboard Stop payload onto userOverride", () => {
    expect(jobExecutionPatchFromBody({ id: "abc", user_override: USER_OVERRIDE.ABORT })).toEqual({
      userOverride: USER_OVERRIDE.ABORT,
    })
    expect(jobExecutionPatchFromBody({ id: "abc", userOverride: USER_OVERRIDE.ABORT })).toEqual({
      userOverride: USER_OVERRIDE.ABORT,
    })
  })

  it("ignores unknown drizzle-incompatible keys", () => {
    expect(jobExecutionPatchFromBody({ id: "abc", user_override: "ABORT", foo: 1 })).toEqual({
      userOverride: "ABORT",
    })
  })
})

describe("toClientJobExecution", () => {
  it("exposes user_override for the dashboard Stop/Delete toggle", () => {
    const row = toClientJobExecution({
      id: "1",
      userOverride: USER_OVERRIDE.ABORT,
      orderTag: "tag1",
      queue: { id: "q1" },
    })
    expect(row.user_override).toBe(USER_OVERRIDE.ABORT)
    expect(row.userOverride).toBe(USER_OVERRIDE.ABORT)
    expect(isJobAborted(row)).toBe(true)
  })
})

describe("dashboardJobActions", () => {
  it("shows Stop for an active live job", () => {
    expect(
      dashboardJobActions({
        jobWasQueued: true,
        isChase: false,
        jobState: "active",
        aborted: false,
        hasSettledPnl: false,
      })
    ).toEqual({ showDelete: false, showStop: true })
  })

  it("shows Delete after Stop has persisted ABORT", () => {
    expect(
      dashboardJobActions({
        jobWasQueued: true,
        isChase: false,
        jobState: "active",
        aborted: true,
        hasSettledPnl: false,
      })
    ).toEqual({ showDelete: true, showStop: false })
  })

  it("shows Delete when the Bull job failed after a revoked Kite token", () => {
    expect(
      dashboardJobActions({
        jobWasQueued: true,
        isChase: false,
        jobState: "failed",
        aborted: false,
        hasSettledPnl: false,
      })
    ).toEqual({ showDelete: true, showStop: false })
  })
})

describe("jobMatchesKillScope", () => {
  it("keeps Chase out of the intraday kill", () => {
    expect(jobMatchesKillScope("ATM_STRADDLE", "intraday")).toBe(true)
    expect(jobMatchesKillScope("ATM_STRANGLE", "intraday")).toBe(true)
    expect(jobMatchesKillScope("SUBSCRIBE_CHASE", "intraday")).toBe(false)
  })

  it("includes Chase only for kill-all", () => {
    expect(jobMatchesKillScope("SUBSCRIBE_CHASE", "all")).toBe(true)
    expect(jobMatchesKillScope("ATM_STRADDLE", "all")).toBe(true)
  })
})
