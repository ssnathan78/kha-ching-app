import useSWR from "swr"
import type { ChaseEngineConfig } from "../chaseDefaults"
import fetchJson from "../fetchJson"

type ChaseSettingsResponse = {
  config: ChaseEngineConfig
}

export function useChaseSettings() {
  return useSWR<ChaseSettingsResponse>("/api/chase-settings", fetchJson)
}
