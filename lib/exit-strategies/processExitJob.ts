import type { KiteOrder } from "../../types/kite"
import type {
  ATM_STRADDLE_TRADE,
  ATM_STRANGLE_TRADE,
  SUPPORTED_TRADE_CONFIG,
} from "../../types/trade"
import { EXIT_STRATEGIES } from "../constants"
import individualLegExitOrders from "./individualLegExitOrders"

type StraddleOrStrangleTrade = ATM_STRADDLE_TRADE | ATM_STRANGLE_TRADE

export function processExitJob(jobData: {
  initialJobData: SUPPORTED_TRADE_CONFIG
  jobResponse: {
    rawKiteOrdersResponse: KiteOrder[]
    squareOffOrders?: KiteOrder[]
  }
}) {
  const { initialJobData, jobResponse } = jobData
  const { exitStrategy } = initialJobData as StraddleOrStrangleTrade

  switch (exitStrategy) {
    case EXIT_STRATEGIES.INDIVIDUAL_LEG_SLM_1X:
      return individualLegExitOrders({
        initialJobData,
        ...jobResponse,
      })
    case EXIT_STRATEGIES.NO_SL:
      return null
    default:
      throw new Error(
        `[exitTradingQueue] unsupported exitStrategy "${exitStrategy}" — job should have been rejected at schedule time`
      )
  }
}
