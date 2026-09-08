import useSWR from "swr"
import type { ChaseEngineConfig } from "../chaseDefaults"
import fetchJson from "../fetchJson"
import type { SetupNotionalRow } from "../trading/setupNotional"

type ChaseSettingsResponse = {
  config: ChaseEngineConfig
  notional?: {
    maxNotionalInr: number
    rows: SetupNotionalRow[]
  }
}

export function useChaseSettings() {
  return useSWR<ChaseSettingsResponse>("/api/chase-settings", fetchJson)
}
