jest.mock("kiteconnect", () => ({
  KiteConnect: jest.fn(),
}))

import userHandler from "../../pages/api/user"
import { invokeApi } from "../support/apiTestClient"
import { createKiteConnectMock, tokenExceptionError } from "../support/kiteMock"
import { createTestUser } from "../support/sessionFactory"

describe("GET /api/user", () => {
  beforeEach(() => {
    const { KiteConnect } = require("kiteconnect")
    KiteConnect.mockImplementation(createKiteConnectMock())
  })

  it("returns isLoggedIn false when no session", async () => {
    const result = await invokeApi(userHandler, { method: "GET", user: null })
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ isLoggedIn: false })
  })

  it("returns profile when session is valid", async () => {
    const user = createTestUser()
    const result = await invokeApi(userHandler, { method: "GET", user })
    expect(result.status).toBe(200)
    const body = result.body as { isLoggedIn: boolean; user_id?: string }
    expect(body.isLoggedIn).toBe(true)
    expect(body.user_id).toBe("TEST001")
  })

  it("destroys session on Kite TokenException", async () => {
    const { KiteConnect } = require("kiteconnect")
    KiteConnect.mockImplementation(() => ({
      getProfile: jest.fn().mockRejectedValue(tokenExceptionError()),
    }))

    const iron = await invokeApi(userHandler, { method: "GET", user: createTestUser() })
    expect(iron.status).toBe(200)
    expect(iron.body).toEqual({ isLoggedIn: false })
  })
})
