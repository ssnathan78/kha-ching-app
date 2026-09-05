import { STRATEGIES } from "../constants"
import atmStraddle from "../strategies/atmStraddle"
import strangle from "../strategies/strangle"

export { isStaleTradingJob } from "./staleJobGuard"

export async function processTradingJob(data: { strategy: string }) {
  switch (data.strategy) {
    case STRATEGIES.ATM_STRADDLE:
      return atmStraddle(data as any)
    case STRATEGIES.ATM_STRANGLE:
      return strangle(data as any)
    default:
      return null
  }
}
