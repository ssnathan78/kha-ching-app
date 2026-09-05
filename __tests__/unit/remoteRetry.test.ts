import { ms, RemoteRetryTimeoutError, withRemoteRetry } from "../../lib/remoteRetry"

jest.setTimeout(20000)

describe("withRemoteRetry", () => {
  it("returns the first successful attempt after a transient failure", async () => {
    const remoteFn = jest
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValueOnce("ok")

    await expect(withRemoteRetry(remoteFn, ms(8))).resolves.toBe("ok")
    expect(remoteFn).toHaveBeenCalledTimes(2)
  })

  it("times out with RemoteRetryTimeoutError", async () => {
    const remoteFn = jest.fn().mockRejectedValue(new Error("still failing"))
    await expect(withRemoteRetry(remoteFn, 50)).rejects.toBeInstanceOf(RemoteRetryTimeoutError)
  })
})
