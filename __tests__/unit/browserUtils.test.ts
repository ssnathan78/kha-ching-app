import dayjs from "dayjs"

import {
  getScheduleableTradeTime,
  getSchedulingApiProps,
  getSchedulingStateProps,
} from "../../lib/browserUtils"
import { STRATEGIES } from "../../lib/constants"

describe("scheduling helpers", () => {
  it("getScheduleableTradeTime is after now when the default run time has passed", () => {
    const runAt = getScheduleableTradeTime(STRATEGIES.ATM_STRADDLE)
    expect(dayjs(runAt).isAfter(dayjs().subtract(1, "minute"))).toBe(true)
  })

  it("getSchedulingStateProps starts with runNow false and a square-off time", () => {
    const props = getSchedulingStateProps(STRATEGIES.ATM_STRANGLE)
    expect(props.runNow).toBe(false)
    expect(props.runAt).toBeTruthy()
    expect(props.squareOffTime).toBeTruthy()
  })

  it("runNow sets runAt to now and still computes expiresAt", () => {
    const before = dayjs()
    const props = getSchedulingApiProps({
      isAutoSquareOffEnabled: true,
      squareOffTime: "2026-09-06T15:20:00+05:30",
      runAt: "2026-09-06T12:20:00+05:30",
      runNow: true,
      expireIfUnsuccessfulInMins: 10,
    })
    expect(dayjs(props.runAt).isAfter(before.subtract(2, "second"))).toBe(true)
    expect(props.autoSquareOffProps?.time).toBe("2026-09-06T15:20:00+05:30")
    expect(dayjs(props.expiresAt).isAfter(dayjs(props.runAt))).toBe(true)
  })

  it("scheduled run keeps the chosen runAt seconds at zero", () => {
    const props = getSchedulingApiProps({
      isAutoSquareOffEnabled: false,
      squareOffTime: "2026-09-06T15:20:00+05:30",
      runAt: "2026-09-06T12:20:33+05:30",
      runNow: false,
      expireIfUnsuccessfulInMins: null,
    })
    expect(dayjs(props.runAt).second()).toBe(0)
    expect(props.autoSquareOffProps).toBeUndefined()
    expect(props.expiresAt).toBeUndefined()
  })
})
