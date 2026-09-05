import logoutHandler from "../../pages/api/logout"
import revokeHandler from "../../pages/api/revoke_session"
import { invokeApi } from "../support/apiTestClient"
import { createTestUser } from "../support/sessionFactory"

describe("session termination APIs", () => {
  it("POST /api/logout clears session", async () => {
    const iron = createTestUser()
    const result = await invokeApi(logoutHandler, { method: "POST", user: iron })
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ isLoggedIn: false })
  })

  it("GET /api/logout returns 405", async () => {
    const result = await invokeApi(logoutHandler, { method: "GET", user: createTestUser() })
    expect(result.status).toBe(405)
  })

  it("POST /api/revoke_session clears session", async () => {
    const result = await invokeApi(revokeHandler, { method: "POST", user: createTestUser() })
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ status: "ok", isLoggedIn: false })
  })

  it("returns 401-equivalent when unauthenticated logout attempted", async () => {
    const result = await invokeApi(logoutHandler, { method: "POST", user: null })
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ isLoggedIn: false })
  })
})
