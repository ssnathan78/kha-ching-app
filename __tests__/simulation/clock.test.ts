import dayjs from "dayjs"
import timezone from "dayjs/plugin/timezone"
import utc from "dayjs/plugin/utc"

import { nowDayjs, resetClock, SimClock, setClock } from "../../lib/clock"
import { isMarketOpen } from "../../lib/utils"

dayjs.extend(utc)
dayjs.extend(timezone)

describe("SimClock", () => {
  afterEach(() => resetClock())

  it("sets and advances simulated IST time", () => {
    const clock = new SimClock("2026-09-07 08:00")
    setClock(clock)
    expect(nowDayjs().tz("Asia/Kolkata").format("YYYY-MM-DD HH:mm")).toBe("2026-09-07 08:00")
    clock.add(90, "minute")
    expect(nowDayjs().tz("Asia/Kolkata").format("HH:mm")).toBe("09:30")
    clock.add(6, "hour")
    expect(nowDayjs().tz("Asia/Kolkata").format("HH:mm")).toBe("15:30")
    clock.add(4, "hour")
    expect(nowDayjs().tz("Asia/Kolkata").format("HH:mm")).toBe("19:30")
  })

  it("pauses so add() does not move time", () => {
    const clock = new SimClock("2026-09-07 10:00")
    clock.pause().add(1, "hour")
    expect(clock.ist().hour()).toBe(10)
    clock.resume().add(1, "hour")
    expect(clock.ist().hour()).toBe(11)
  })

  it("jumps Friday close → Monday open across the weekend", () => {
    const clock = new SimClock("2026-09-04 16:00")
    clock.jumpToNextTradingDay()
    expect(clock.ist().format("YYYY-MM-DD HH:mm")).toBe("2026-09-07 09:15")
  })

  it("drives isMarketOpen through the injected clock", () => {
    const clock = new SimClock("2026-09-07 08:00")
    setClock(clock)
    expect(isMarketOpen()).toBe(false)
    clock.set("2026-09-07 10:30")
    expect(isMarketOpen()).toBe(true)
    clock.set("2026-09-07 16:00")
    expect(isMarketOpen()).toBe(false)
  })
})
