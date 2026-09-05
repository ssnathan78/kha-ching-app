jest.mock("kiteconnect", () => ({
  KiteConnect: jest.fn(),
}))

import getOrdersHandler from "../../pages/api/get_orders"
import orderHistoryHandler from "../../pages/api/order_history"
import pnlHandler from "../../pages/api/pnl"
import positionsHandler from "../../pages/api/positions"
import { invokeApi } from "../support/apiTestClient"
import { createKiteConnectMock } from "../support/kiteMock"
import { createTestUser } from "../support/sessionFactory"

describe("broker proxy APIs", () => {
  beforeEach(() => {
    const { KiteConnect } = require("kiteconnect")
    KiteConnect.mockImplementation(
      createKiteConnectMock({
        getOrders: jest.fn().mockResolvedValue([
          {
            order_id: "1",
            tradingsymbol: "NIFTY25SEPF25000CE",
            status: "COMPLETE",
            tag: "testtag",
          },
        ]),
        getOrderHistory: jest.fn().mockResolvedValue([{ status: "COMPLETE", order_id: "1" }]),
        getPositions: jest.fn().mockResolvedValue({ net: [] }),
      })
    )
  })

  const user = createTestUser()

  it("GET /api/get_orders returns 401 without session", async () => {
    const result = await invokeApi(getOrdersHandler, {
      method: "GET",
      query: { order_tag: "x" },
      user: null,
    })
    expect(result.status).toBe(401)
  })

  it("GET /api/get_orders returns orders for tag", async () => {
    const result = await invokeApi(getOrdersHandler, {
      method: "GET",
      query: { order_tag: "testtag" },
      user,
    })
    expect(result.status).toBe(200)
    expect(Array.isArray(result.body)).toBe(true)
  })

  it("GET /api/order_history requires id query", async () => {
    const result = await invokeApi(orderHistoryHandler, {
      method: "GET",
      query: {},
      user,
    })
    expect(result.status).toBe(400)
    expect((result.body as { error: string }).error).toContain("expected id")
  })

  it("GET /api/order_history returns history when id provided", async () => {
    const result = await invokeApi(orderHistoryHandler, {
      method: "GET",
      query: { id: "210428200252388" },
      user,
    })
    expect(result.status).toBe(200)
    expect(Array.isArray(result.body)).toBe(true)
  })

  it("GET /api/positions returns MIS net positions array", async () => {
    const result = await invokeApi(positionsHandler, { method: "GET", user })
    expect(result.status).toBe(200)
    expect(Array.isArray(result.body)).toBe(true)
  })

  it("GET /api/pnl requires order_tag", async () => {
    const noTag = await invokeApi(pnlHandler, { method: "GET", query: {}, user })
    expect(noTag.status).toBeGreaterThanOrEqual(400)
  })
})
