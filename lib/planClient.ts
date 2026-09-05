import type { DailyPlansConfig, DailyPlansDayKey } from "../types/misc"
import type { AvailablePlansConfig } from "../types/plans"
import { STRATEGIES, STRATEGIES_DETAILS } from "./constants"
import { mapPlanFromDb, mapPlanToDb, planApiErrorMessage } from "./planMapper"

export function hydratePlanConfig(config: Record<string, unknown>): AvailablePlansConfig {
  const defaults =
    config?.strategy && STRATEGIES_DETAILS[config.strategy as STRATEGIES]?.defaultFormState
      ? STRATEGIES_DETAILS[config.strategy as STRATEGIES].defaultFormState
      : {}
  return { ...defaults, ...config } as AvailablePlansConfig
}

export function groupPlansByDay(
  data: Record<string, unknown>[],
  seed: DailyPlansConfig
): DailyPlansConfig {
  const dayWiseData = data.reduce<Record<string, Record<string, AvailablePlansConfig>>>(
    (accum, config) => {
      const dayKey = String(
        config.day_of_week || config.dayOfWeek || config.collection || ""
      ).toLowerCase()
      if (!dayKey || config.strategy === STRATEGIES.SUBSCRIBE_CHASE) {
        return accum
      }
      const hydrated = hydratePlanConfig(config)
      if (accum[dayKey]) {
        return {
          ...accum,
          [dayKey]: {
            ...accum[dayKey],
            [String(config.id)]: hydrated,
          },
        }
      }
      return {
        ...accum,
        [dayKey]: { [String(config.id)]: hydrated },
      }
    },
    {}
  )

  return (Object.keys(seed) as DailyPlansDayKey[]).reduce((accum, dayKey) => {
    return {
      ...accum,
      [dayKey]: {
        ...seed[dayKey],
        strategies: dayWiseData[dayKey] || {},
      },
    }
  }, {} as DailyPlansConfig)
}

export { mapPlanFromDb, mapPlanToDb, planApiErrorMessage }
