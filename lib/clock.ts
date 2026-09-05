import dayjs, { type Dayjs, type ManipulateType } from "dayjs"
import timezone from "dayjs/plugin/timezone"
import utc from "dayjs/plugin/utc"

import { IST_TZ, nextSessionOpen, sessionBounds } from "./marketCalendar"

dayjs.extend(utc)
dayjs.extend(timezone)

export type Clock = {
  nowMs(): number
  now(): Date
  nowDayjs(): Dayjs
}

class SystemClock implements Clock {
  nowMs(): number {
    return Date.now()
  }
  now(): Date {
    return new Date()
  }
  nowDayjs(): Dayjs {
    return dayjs()
  }
}

const SYSTEM = new SystemClock()
let active: Clock = SYSTEM

/** Current clock. Production uses wall time unless a simulation clock is installed. */
export function getClock(): Clock {
  return active
}

export function setClock(clock: Clock | null): void {
  active = clock ?? SYSTEM
}

export function resetClock(): void {
  active = SYSTEM
}

export function now(): Date {
  return active.now()
}

export function nowMs(): number {
  return active.nowMs()
}

export function nowDayjs(): Dayjs {
  return active.nowDayjs()
}

export type TimeUnit =
  | "millisecond"
  | "second"
  | "minute"
  | "hour"
  | "day"
  | "week"
  | "month"
  | "year"

/**
 * Controllable clock for simulations. Never used in production unless tests install it.
 * Jump helpers use the NSE calendar; they do not change wall time.
 */
export class SimClock implements Clock {
  private t: number
  paused = false

  constructor(at: string | number | Date | Dayjs) {
    this.t = toMs(at)
  }

  nowMs(): number {
    return this.t
  }

  now(): Date {
    return new Date(this.t)
  }

  nowDayjs(): Dayjs {
    return dayjs(this.t)
  }

  /** Asia/Kolkata view of the simulated instant. */
  ist(): Dayjs {
    return dayjs(this.t).tz(IST_TZ)
  }

  set(at: string | number | Date | Dayjs): this {
    this.t = toMs(at)
    return this
  }

  add(amount: number, unit: TimeUnit | ManipulateType = "second"): this {
    if (this.paused) return this
    this.t = this.ist()
      .add(amount, unit as ManipulateType)
      .valueOf()
    return this
  }

  pause(): this {
    this.paused = true
    return this
  }

  resume(): this {
    this.paused = false
    return this
  }

  jumpToMarketOpen(extraHolidays: Iterable<string> = []): this {
    const bounds = sessionBounds(this.ist(), extraHolidays)
    if (bounds && this.ist().isBefore(bounds.open)) {
      this.t = bounds.open.valueOf()
      return this
    }
    const next = nextSessionOpen(this.ist(), extraHolidays)
    this.t = next.valueOf()
    return this
  }

  jumpToMarketClose(extraHolidays: Iterable<string> = []): this {
    const bounds = sessionBounds(this.ist(), extraHolidays)
    if (bounds) {
      this.t = bounds.close.valueOf()
      return this
    }
    const next = nextSessionOpen(this.ist(), extraHolidays)
    const nextBounds = sessionBounds(next, extraHolidays)
    if (nextBounds) this.t = nextBounds.close.valueOf()
    return this
  }

  jumpToNextSession(extraHolidays: Iterable<string> = []): this {
    const bounds = sessionBounds(this.ist(), extraHolidays)
    if (bounds && this.ist().isBefore(bounds.open)) {
      this.t = bounds.open.valueOf()
      return this
    }
    this.t = nextSessionOpen(this.ist().add(1, "minute"), extraHolidays).valueOf()
    return this
  }

  jumpToNextTradingDay(extraHolidays: Iterable<string> = []): this {
    this.t = nextSessionOpen(this.ist().add(1, "day").startOf("day"), extraHolidays).valueOf()
    return this
  }
}

function toMs(at: string | number | Date | Dayjs): number {
  if (typeof at === "number") return at
  if (at instanceof Date) return at.getTime()
  if (dayjs.isDayjs(at)) return at.valueOf()
  const parsed = dayjs.tz(at, IST_TZ)
  if (!parsed.isValid()) {
    throw new Error(`SimClock: invalid time ${String(at)}`)
  }
  return parsed.valueOf()
}
