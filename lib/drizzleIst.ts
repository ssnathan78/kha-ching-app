import type { AnyColumn } from "drizzle-orm"
import { type SQL, sql } from "drizzle-orm"

/** True when `column` falls on today's calendar date in Asia/Kolkata. */
export function istToday(column: AnyColumn): SQL {
  return sql`(${column} AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date`
}

/** True when `column` falls on the given date's calendar day in Asia/Kolkata. */
export function istOnDate(column: AnyColumn, date: SQL | string | Date): SQL {
  return sql`(${column} AT TIME ZONE 'Asia/Kolkata')::date = (${date}::timestamptz AT TIME ZONE 'Asia/Kolkata')::date`
}
