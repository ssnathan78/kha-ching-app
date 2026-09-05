import { EXIT_STRATEGIES } from "../../../lib/constants"
import { processExitJob } from "../../../lib/exit-strategies/processExitJob"
import { baseStraddleJob } from "../../support/jobFixtures"

jest.mock("../../../lib/exit-strategies/individualLegExitOrders", () =>
  jest.fn().mockResolvedValue([{ order_id: "exit-1" }])
)

const individualLegExitOrders = require("../../../lib/exit-strategies/individualLegExitOrders")

describe("processExitJob", () => {
  const jobResponse = {
    rawKiteOrdersResponse: [
      {
        tradingsymbol: "NIFTY25SEP25000CE",
        transaction_type: "SELL",
        average_price: 100,
        quantity: 65,
        product: "MIS",
        exchange: "NFO",
      },
    ],
  }

  it("delegates INDIVIDUAL_LEG_SLM_1X to individualLegExitOrders", async () => {
    const initialJobData = baseStraddleJob({
      exitStrategy: EXIT_STRATEGIES.INDIVIDUAL_LEG_SLM_1X,
    })
    const result = await processExitJob({ initialJobData, jobResponse })
    expect(individualLegExitOrders).toHaveBeenCalled()
    expect(result).toEqual([{ order_id: "exit-1" }])
  })

  it("returns null for NO_SL without placing orders", async () => {
    const result = await processExitJob({
      initialJobData: baseStraddleJob({ exitStrategy: EXIT_STRATEGIES.NO_SL }),
      jobResponse,
    })
    expect(result).toBeNull()
    expect(individualLegExitOrders).not.toHaveBeenCalledTimes(2)
  })

  it("throws for unimplemented exit (prevents silent no-SL harm)", () => {
    expect(() =>
      processExitJob({
        initialJobData: baseStraddleJob({
          exitStrategy: EXIT_STRATEGIES.MULTI_LEG_PREMIUM_THRESHOLD,
        }),
        jobResponse,
      })
    ).toThrow(/unsupported exitStrategy/)
  })
})
