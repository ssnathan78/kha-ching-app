import dayjs, { type ConfigType } from "dayjs"

export const PAST_PLAN_SCHEDULE_ERROR =
  "Those template times have already passed. Use Run now on a card, or open the strategy and Schedule now."

export function futurePlansToSchedule<T extends { runAt?: string | Date | null }>(
  plans: T[] | null | undefined,
  now: ConfigType = dayjs()
): T[] {
  if (!Array.isArray(plans)) return []
  const nowAt = dayjs(now)
  return plans.filter(plan => Boolean(plan.runAt) && dayjs(plan.runAt).isAfter(nowAt))
}
