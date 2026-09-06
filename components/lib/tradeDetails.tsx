import type { Job } from "bullmq"
import { STRATEGIES } from "../../lib/constants"
import type { SUPPORTED_TRADE_CONFIG } from "../../types/trade"
import ATMStraddleDetails from "../trades/atmStraddle/TradeSetupDetails"
import ATMStrangleDetails from "../trades/atmStrangle/TradeSetupDetails"

const TradeDetails = ({
  strategy,
  tradeDetails,
  jobDetails,
}: {
  strategy: STRATEGIES | string
  tradeDetails: SUPPORTED_TRADE_CONFIG | Record<string, unknown>
  jobDetails?: Job | Record<string, unknown>
}) => {
  const jobProps = (jobDetails ?? {}) as Record<string, unknown>
  return (
    <>
      {strategy === STRATEGIES.ATM_STRADDLE ? (
        <ATMStraddleDetails {...tradeDetails} {...jobProps} />
      ) : strategy === STRATEGIES.ATM_STRANGLE ? (
        <ATMStrangleDetails {...tradeDetails} {...jobProps} />
      ) : strategy === STRATEGIES.CHASE ? (
        <p style={{ margin: "8px 0" }}>Lots: {(tradeDetails as any).lots ?? "—"}</p>
      ) : null}
    </>
  )
}

export default TradeDetails
