import dayjs from "dayjs"

import { STRATEGIES } from "../../../lib/constants"
import { isStaleTradingJob } from "../../../lib/queue-processor/staleJobGuard"
import { processTradingJob } from "../../../lib/queue-processor/tradingJobProcessor"

jest.mock("../../../lib/strategies/atmStraddle", () =>
  jest.fn().mockResolvedValue({ _nextTradingQueue: "exit", isTargetEnabled: true })
)
jest.mock("../../../lib/strategies/strangle", () =>
  jest.fn().mockResolvedValue({ rawKiteOrdersResponse: [] })
)

import atmStraddle from "../../../lib/strategies/atmStraddle"
import strangle from "../../../lib/strategies/strangle"

describe("processTradingJob", () => {
  beforeEach(() => jest.clearAllMocks())

  it("routes ATM_STRADDLE to atmStraddle", async () => {
    const data = { strategy: STRATEGIES.ATM_STRADDLE, id: "1" }
    await processTradingJob(data)
    expect(atmStraddle).toHaveBeenCalledWith(data)
  })

  it("routes ATM_STRANGLE to strangle", async () => {
    const data = { strategy: STRATEGIES.ATM_STRANGLE, id: "2" }
    await processTradingJob(data)
    expect(strangle).toHaveBeenCalledWith(data)
  })

  it("returns null for unknown strategy (no accidental orders)", async () => {
    const result = await processTradingJob({ strategy: "UNKNOWN" })
    expect(result).toBeNull()
    expect(atmStraddle).not.toHaveBeenCalled()
    expect(strangle).not.toHaveBeenCalled()
  })
})

describe("isStaleTradingJob (queue processor)", () => {
  it("discards jobs from previous calendar day", () => {
    const yesterday = dayjs().subtract(1, "day").valueOf()
    expect(isStaleTradingJob(yesterday)).toBe(true)
  })
})
