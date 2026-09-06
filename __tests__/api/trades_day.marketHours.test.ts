import { JOB_EXECUTION_STATUS } from "../../lib/constants"
import { invokeApi } from "../support/apiTestClient"
import { createTestPool, deleteJobExecutionsByTags, describeDb } from "../support/dbHelpers"
import { baseStraddleJob } from "../support/jobFixtures"
import { createTestUser } from "../support/sessionFactory"

const mockIsMockOrder = jest.fn(() => true)
const mockIsMarketOpen = jest.fn(() => false)

jest.mock("../../lib/utils", () => {
  const actual = jest.requireActual("../../lib/utils")
  return {
    ...actual,
    isMockOrder: () => mockIsMockOrder(),
    isMarketOpen: () => mockIsMarketOpen(),
  }
})

import tradesDayHandler from "../../pages/api/trades_day"
import { addToNextQueue } from "../../lib/queue"

describeDb("/api/trades_day market hours", () => {
  const pool = createTestPool()
  const orderTags: string[] = []
  const jobIds: string[] = []
  const user = createTestUser()

  beforeEach(() => {
    ;(addToNextQueue as jest.Mock).mockResolvedValue({
      id: "bull-mock-1",
      name: "trading",
      opts: {},
      timestamp: Date.now(),
    })
  })

  afterEach(() => {
    mockIsMockOrder.mockReturnValue(true)
    mockIsMarketOpen.mockReturnValue(false)
  })

  afterAll(async () => {
    if (jobIds.length) {
      await pool.query(`DELETE FROM job_executions WHERE id = ANY($1::text[])`, [jobIds])
    }
    await deleteJobExecutionsByTags(pool, orderTags)
    await pool.end()
  })

  it("MOCK_ORDERS=true + closed session + runNow returns 200 QUEUE", async () => {
    mockIsMockOrder.mockReturnValue(true)
    mockIsMarketOpen.mockReturnValue(false)
    const result = await invokeApi(tradesDayHandler, {
      method: "POST",
      user,
      body: baseStraddleJob({ runNow: true, name: "Mock Sunday punch" }),
    })
    expect(result.status).toBe(200)
    const body = result.body as { id?: string; orderTag?: string; status?: string }
    expect(body.id).toBeTruthy()
    expect(["PENDING", "QUEUE"]).toContain(body.status)
    if (body.id) jobIds.push(body.id)
    if (body.orderTag) orderTags.push(body.orderTag)
  })

  it("live + closed session + runNow returns 409 MARKET_CLOSED", async () => {
    mockIsMockOrder.mockReturnValue(false)
    mockIsMarketOpen.mockReturnValue(false)
    const result = await invokeApi(tradesDayHandler, {
      method: "POST",
      user,
      body: baseStraddleJob({ runNow: true, name: "Live Sunday reject" }),
    })
    expect(result.status).toBe(409)
    const body = result.body as {
      id?: string
      orderTag?: string
      status?: string
      code?: string
      error?: string
    }
    expect(body.status).toBe(JOB_EXECUTION_STATUS.REJECT)
    expect(body.code).toBe("MARKET_CLOSED")
    expect(body.error).toMatch(/offline/i)
    if (body.id) jobIds.push(body.id)
    if (body.orderTag) orderTags.push(body.orderTag)
  })
})
