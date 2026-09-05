describe("isSessionCookieSecure", () => {
  const env = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...env }
    delete process.env.SESSION_COOKIE_SECURE
    delete process.env.NEXT_PUBLIC_APP_URL
    delete process.env.NODE_ENV
  })

  afterAll(() => {
    process.env = env
  })

  it("is off when SESSION_COOKIE_SECURE=false (local Docker HTTP)", () => {
    process.env.SESSION_COOKIE_SECURE = "false"
    process.env.NODE_ENV = "production"
    const { isSessionCookieSecure } = require("../../lib/sessionCookie")
    expect(isSessionCookieSecure()).toBe(false)
  })

  it("is on when SESSION_COOKIE_SECURE=true", () => {
    process.env.SESSION_COOKIE_SECURE = "true"
    const { isSessionCookieSecure } = require("../../lib/sessionCookie")
    expect(isSessionCookieSecure()).toBe(true)
  })

  it("is off for an http:// app URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://127.0.0.1:3000"
    const { isSessionCookieSecure } = require("../../lib/sessionCookie")
    expect(isSessionCookieSecure()).toBe(false)
  })
})
