import dayjs from "dayjs"
import timezone from "dayjs/plugin/timezone"
import utc from "dayjs/plugin/utc"

import { IST_TZ } from "../marketCalendar"

dayjs.extend(utc)
dayjs.extend(timezone)

export type FeedPeriod = "all" | "today" | "before_today"
export type FeedClearMode = "all" | "today" | "before_today"
export type OperatorFeed = "alerts" | "signals"

export type FeedClear = {
  mode: FeedClearMode
  istDate?: string | null
  before?: Date | string | null
}

export function parseFeedPeriod(value: unknown): FeedPeriod {
  if (value === "today" || value === "before_today" || value === "all") return value
  return "all"
}

export function parseFeedClearMode(value: unknown): FeedClearMode | null {
  if (value === "all" || value === "today" || value === "before_today") return value
  return null
}

export function istTodayBounds(now: Date = new Date()) {
  const start = dayjs(now).tz(IST_TZ).startOf("day")
  return {
    start: start.toDate(),
    end: start.add(1, "day").toDate(),
    istDate: start.format("YYYY-MM-DD"),
  }
}

export function periodBounds(period: FeedPeriod, now: Date = new Date()) {
  const { start, end } = istTodayBounds(now)
  if (period === "today") return { from: start, to: end }
  if (period === "before_today") return { from: undefined, to: start }
  return { from: undefined, to: undefined }
}

export function shouldSampleSkewAttempt(attempt: number) {
  return attempt === 0 || attempt % 25 === 0
}

export function isHiddenByClears(occurredAt: Date, clears: FeedClear[], now: Date = new Date()) {
  const { start, istDate } = istTodayBounds(now)
  for (const clear of clears) {
    if (clear.mode === "all" && clear.before) {
      if (occurredAt.getTime() <= new Date(clear.before).getTime()) return true
    }
    if (clear.mode === "today") {
      const day = clear.istDate || istDate
      const dayStart = dayjs.tz(day, IST_TZ).startOf("day")
      const dayEnd = dayStart.add(1, "day")
      const cut = clear.before ? new Date(clear.before) : dayEnd.toDate()
      if (occurredAt.getTime() >= dayStart.valueOf() && occurredAt.getTime() <= cut.getTime()) {
        return true
      }
    }
    if (clear.mode === "before_today") {
      const cut = clear.before ? new Date(clear.before) : start
      if (occurredAt.getTime() < cut.getTime()) return true
    }
  }
  return false
}
