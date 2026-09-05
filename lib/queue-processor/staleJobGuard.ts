import dayjs, { type Dayjs } from "dayjs"

/** True when a BullMQ job was scheduled for a previous calendar day (IST). */
export function isStaleTradingJob(scheduledAtMs: number, delayMs = 0, now: Dayjs = dayjs()) {
  const scheduledAt = dayjs(scheduledAtMs + delayMs)
  return !scheduledAt.isSame(now, "day")
}
