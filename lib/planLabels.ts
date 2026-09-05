import { EXIT_STRATEGIES_DETAILS, STRATEGIES, STRATEGIES_DETAILS } from "./constants"

export function exitStrategyLabel(exitStrategy?: string | null): string {
  return (
    EXIT_STRATEGIES_DETAILS[exitStrategy as keyof typeof EXIT_STRATEGIES_DETAILS]?.label ??
    (exitStrategy || "—")
  )
}

export function strangleEntryLabel(entryStrategy?: string | null): string {
  const details = STRATEGIES_DETAILS[STRATEGIES.ATM_STRANGLE].ENTRY_STRATEGY_DETAILS
  return details[entryStrategy as keyof typeof details]?.label ?? "by distance from ATM strike"
}
