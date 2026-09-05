import { createTestUser } from "../support/sessionFactory"

jest.mock("../../lib/queue", () => ({
  addToNextQueue: jest.fn().mockResolvedValue(undefined),
}))

jest.mock("../../lib/kiteUtils", () => ({
  syncGetKiteInstance: jest.fn(() => ({
    STATUS_COMPLETE: "COMPLETE",
    STATUS_CANCELLED: "CANCELLED",
    ORDER_TYPE_MARKET: "MARKET",
    getOrderHistory: jest.fn(),
    modifyOrder: jest.fn().mockResolvedValue({}),
  })),
}))

jest.mock("../../lib/utils", () => {
  class RemoteRetryTimeoutError extends Error {}
  return {
    withRemoteRetry: (fn: () => unknown) => (typeof fn === "function" ? fn() : fn),
    finiteStateChecker: jest.fn(),
    ms: (s: number) => s * 1000,
    orderStateChecker: jest.fn().mockReturnValue({ promise: Promise.resolve(), cancel: jest.fn() }),
    RemoteRetryTimeoutError,
  }
})

describe("slmWatcher", () => {
  it("resolves when order completes", async () => {
    const { syncGetKiteInstance } = require("../../lib/kiteUtils")
    syncGetKiteInstance.mockReturnValue({
      STATUS_COMPLETE: "COMPLETE",
      STATUS_CANCELLED: "CANCELLED",
      getOrderHistory: jest.fn().mockResolvedValue([{ status: "COMPLETE" }]),
    })
    const slmWatcher = (await import("../../lib/watchers/slmWatcher")).default
    const result = await slmWatcher({
      slmOrderId: "1",
      user: createTestUser(),
      originalTriggerPrice: 100,
      _queueJobData: { initialJobData: {} as any },
    })
    expect(String(result)).toContain("COMPLETED")
  })
})

describe("sllWatcher", () => {
  it("converts open SLL to market after timeout", async () => {
    const { RemoteRetryTimeoutError } = require("../../lib/utils")
    const { finiteStateChecker } = require("../../lib/utils")
    finiteStateChecker.mockRejectedValue(new RemoteRetryTimeoutError("timeout"))

    const kite = {
      STATUS_COMPLETE: "COMPLETE",
      STATUS_CANCELLED: "CANCELLED",
      ORDER_TYPE_MARKET: "MARKET",
      getOrderHistory: jest
        .fn()
        .mockResolvedValue([{ status: "OPEN", variety: "regular", order_id: "sll-1" }]),
      modifyOrder: jest.fn().mockResolvedValue({}),
    }
    const { syncGetKiteInstance } = require("../../lib/kiteUtils")
    syncGetKiteInstance.mockReturnValue(kite)

    const sllWatcher = (await import("../../lib/watchers/sllWatcher")).default
    const result = await sllWatcher({ sllOrderId: "sll-1", user: createTestUser() })
    expect(kite.modifyOrder).toHaveBeenCalled()
    expect(String(result)).toContain("squared off")
  })
})
