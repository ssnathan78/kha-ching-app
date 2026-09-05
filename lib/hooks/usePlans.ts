import useSWR from "swr"
import type { AvailablePlansConfig } from "../../types/plans"
import fetchJson from "../fetchJson"

export function usePlans() {
  return useSWR<AvailablePlansConfig[]>("/api/plan", fetchJson)
}
