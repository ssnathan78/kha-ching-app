import dayjs, { type Dayjs } from "dayjs"
import customParseFormat from "dayjs/plugin/customParseFormat"
import timezone from "dayjs/plugin/timezone"
import utc from "dayjs/plugin/utc"

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(customParseFormat)

export const IST_TZ = "Asia/Kolkata"

/** NSE F&O continuous session used by this app (exclusive bounds, matching `isMarketOpen`). */
export const DEFAULT_SESSION = {
  openHour: 9,
  openMinute: 15,
  closeHour: 15,
  closeMinute: 30,
}

/** Chase SL/signal window (inclusive minutes from midnight). */
export const CHASE_OPEN_MINUTES = 9 * 60 + 16
export const CHASE_CLOSE_MINUTES = 15 * 60 + 29

export type MarketSessionState =
  | "CLOSED"
  | "PRE_MARKET"
  | "OPEN"
  | "POST_MARKET"
  | "HALTED"
  | "SUSPENDED"
  | "WEEKEND"
  | "HOLIDAY"
  | "OVERNIGHT"

export type SessionTimes = {
  openHour: number
  openMinute: number
  closeHour: number
  closeMinute: number
}

export type CalendarOverrides = {
  extraHolidays?: string[]
  closedDates?: string[]
  earlyCloses?: Record<string, string>
  session?: Partial<SessionTimes>
}

/**
 * Historic labels kept byte-compatible with the previous `utils` holiday table
 * (including the one "February 21, 2020" space-after-comma entry).
 */
const HISTORIC_HOLIDAY_LABELS: string[] = [
  "September 20,2018",
  "October 02,2018",
  "October 18,2018",
  "November 07,2018",
  "November 08,2018",
  "November 23,2018",
  "December 25,2018",
  "March 04,2019",
  "March 21,2019",
  "April 17,2019",
  "April 19,2019",
  "April 29,2019",
  "May 01,2019",
  "June 05,2019",
  "August 12,2019",
  "August 15,2019",
  "September 02,2019",
  "September 10,2019",
  "October 02,2019",
  "October 08,2019",
  "October 21,2019",
  "October 28,2019",
  "November 12,2019",
  "December 25,2019",
  "February 21, 2020",
  "March 10,2020",
  "April 02,2020",
  "April 06,2020",
  "April 10,2020",
  "April 14,2020",
  "May 01,2020",
  "May 25,2020",
  "October 02,2020",
  "November 16,2020",
  "November 30,2020",
  "December 25,2020",
  "January 26,2021",
  "March 11,2021",
  "March 29,2021",
  "April 02,2021",
  "April 14,2021",
  "April 21,2021",
  "May 13,2021",
  "July 21,2021",
  "August 19,2021",
  "September 10,2021",
  "October 15,2021",
  "November 04,2021",
  "November 05,2021",
  "November 19,2021",
  "January 26,2022",
  "March 01,2022",
  "March 18,2022",
  "April 14,2022",
  "April 15,2022",
  "May 03,2022",
  "August 09,2022",
  "August 15,2022",
  "August 31,2022",
  "October 05,2022",
  "October 24,2022",
  "October 26,2022",
  "November 08,2022",
]

/** NSE cash/F&O holidays used for 2025–2026 simulations. Weekends are handled separately. */
const RECENT_HOLIDAYS_ISO = [
  "2025-01-26",
  "2025-02-26",
  "2025-03-14",
  "2025-03-31",
  "2025-04-10",
  "2025-04-14",
  "2025-04-18",
  "2025-05-01",
  "2025-08-15",
  "2025-08-27",
  "2025-10-02",
  "2025-10-21",
  "2025-10-22",
  "2025-11-05",
  "2025-12-25",
  "2026-01-26",
  "2026-03-03",
  "2026-03-26",
  "2026-03-31",
  "2026-04-03",
  "2026-04-14",
  "2026-05-01",
  "2026-09-14",
  "2026-10-02",
  "2026-10-20",
  "2026-11-10",
  "2026-11-24",
  "2026-12-25",
]

const HOLIDAY_FORMATS = ["MMMM DD,YYYY", "MMMM DD, YYYY", "YYYY-MM-DD"]

function toIsoDate(value: string | Dayjs | Date): string {
  if (typeof value === "string") {
    for (const fmt of HOLIDAY_FORMATS) {
      const parsed = dayjs(value, fmt, true)
      if (parsed.isValid()) return parsed.format("YYYY-MM-DD")
    }
    const loose = dayjs(value)
    if (loose.isValid()) return loose.format("YYYY-MM-DD")
    return value
  }
  return dayjs(value).tz(IST_TZ).format("YYYY-MM-DD")
}

const DEFAULT_HOLIDAYS = new Set<string>([
  ...HISTORIC_HOLIDAY_LABELS.map(toIsoDate),
  ...RECENT_HOLIDAYS_ISO,
])

export function isWeekend(date: Dayjs | Date | string): boolean {
  const d = dayjs(date).tz(IST_TZ)
  const name = d.format("dddd")
  return name === "Saturday" || name === "Sunday"
}

export function isListedHoliday(
  date: Dayjs | Date | string,
  extraHolidays: Iterable<string> = []
): boolean {
  const iso = toIsoDate(date)
  if (DEFAULT_HOLIDAYS.has(iso)) return true
  for (const extra of extraHolidays) {
    if (toIsoDate(extra) === iso) return true
  }
  return false
}

/** Weekend or listed holiday (same meaning as the previous `isDateHoliday`). */
export function isNonTradingDay(
  date: Dayjs | Date | string,
  extraHolidays: Iterable<string> = []
): boolean {
  if (isWeekend(date)) return true
  return isListedHoliday(date, extraHolidays)
}

export function resolveSessionTimes(
  date: Dayjs | Date | string,
  overrides: CalendarOverrides = {}
): SessionTimes {
  const iso = toIsoDate(date)
  const base: SessionTimes = {
    ...DEFAULT_SESSION,
    ...overrides.session,
  }
  const early = overrides.earlyCloses?.[iso]
  if (early) {
    const [h, m] = early.split(":").map(Number)
    if (Number.isFinite(h) && Number.isFinite(m)) {
      return { ...base, closeHour: h, closeMinute: m }
    }
  }
  return base
}

export function isForcedClosed(
  date: Dayjs | Date | string,
  overrides: CalendarOverrides = {}
): boolean {
  const iso = toIsoDate(date)
  return (overrides.closedDates ?? []).some(d => toIsoDate(d) === iso)
}

export type SessionBounds = { open: Dayjs; close: Dayjs }

export function sessionBounds(
  date: Dayjs | Date | string | number,
  extraHolidays: Iterable<string> = [],
  overrides: CalendarOverrides = {}
): SessionBounds | null {
  const ist = dayjs(date).tz(IST_TZ)
  const extras = [...(overrides.extraHolidays ?? []), ...extraHolidays]
  if (isNonTradingDay(ist, extras) || isForcedClosed(ist, overrides)) return null
  const times = resolveSessionTimes(ist, overrides)
  const open = ist.hour(times.openHour).minute(times.openMinute).second(0).millisecond(0)
  const close = ist.hour(times.closeHour).minute(times.closeMinute).second(0).millisecond(0)
  return { open, close }
}

/**
 * Exclusive session: after open and before close — matches historic `isMarketOpen`.
 */
export function isSessionOpen(
  time: Dayjs | Date | string | number = dayjs(),
  extraHolidays: Iterable<string> = [],
  overrides: CalendarOverrides = {}
): boolean {
  const ist = dayjs(time).tz(IST_TZ)
  const bounds = sessionBounds(ist, extraHolidays, overrides)
  if (!bounds) return false
  return ist.isAfter(bounds.open) && ist.isBefore(bounds.close)
}

export function marketSessionState(
  time: Dayjs | Date | string | number,
  extraHolidays: Iterable<string> = [],
  overrides: CalendarOverrides = {},
  forced?: MarketSessionState | null
): MarketSessionState {
  if (forced) return forced
  const ist = dayjs(time).tz(IST_TZ)
  const extras = [...(overrides.extraHolidays ?? []), ...extraHolidays]
  if (isWeekend(ist)) return "WEEKEND"
  if (isListedHoliday(ist, extras) || isForcedClosed(ist, overrides)) return "HOLIDAY"

  const bounds = sessionBounds(ist, extras, overrides)
  if (!bounds) return "CLOSED"

  const preOpen = bounds.open.subtract(15, "minute")
  const postClose = bounds.close.add(30, "minute")

  if (ist.isAfter(bounds.open) && ist.isBefore(bounds.close)) return "OPEN"
  if (!ist.isBefore(preOpen) && !ist.isAfter(bounds.open)) return "PRE_MARKET"
  if (!ist.isBefore(bounds.close) && ist.isBefore(postClose)) return "POST_MARKET"
  if (ist.isAfter(postClose) || ist.hour() < 6) return "OVERNIGHT"
  return "CLOSED"
}

export function nextSessionOpen(
  from: Dayjs | Date | string,
  extraHolidays: Iterable<string> = [],
  overrides: CalendarOverrides = {},
  maxDays = 21
): Dayjs {
  let cursor = dayjs(from).tz(IST_TZ)
  for (let i = 0; i < maxDays; i++) {
    const bounds = sessionBounds(cursor, extraHolidays, overrides)
    if (bounds && !cursor.isAfter(bounds.open)) {
      return bounds.open
    }
    cursor = cursor.add(1, "day").startOf("day")
  }
  throw new Error("nextSessionOpen: no trading session within search window")
}

export function isChaseWindow(time: Dayjs | Date | string | number): boolean {
  const ist = dayjs(time).tz(IST_TZ)
  if (isNonTradingDay(ist)) return false
  const minutes = ist.hour() * 60 + ist.minute()
  return minutes >= CHASE_OPEN_MINUTES && minutes <= CHASE_CLOSE_MINUTES
}
