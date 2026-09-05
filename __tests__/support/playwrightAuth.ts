import type { BrowserContext } from "@playwright/test"
import { sealData } from "iron-session"

import { SESSION_COOKIE_NAME } from "../../lib/session"
import { createTestUser } from "./sessionFactory"

const password = process.env.SECRET_COOKIE_PASSWORD || "test-secret-cookie-password-min-32-chars"

/** Seal an iron-session cookie value for E2E tests (no real Kite OAuth). */
export async function sealTestSessionCookie(): Promise<string> {
  const user = createTestUser()
  return sealData(
    { user },
    {
      password,
      ttl: 60 * 60 * 24,
    }
  )
}

/** Apply authenticated session cookie to a Playwright browser context. */
export async function applyAuthCookie(context: BrowserContext, baseURL: string) {
  const sealed = await sealTestSessionCookie()
  const url = new URL(baseURL)
  await context.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: sealed,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      secure: url.protocol === "https:",
    },
  ])
}

export async function clearAuthCookie(context: BrowserContext, baseURL: string) {
  const url = new URL(baseURL)
  await context.clearCookies({ domain: url.hostname, name: SESSION_COOKIE_NAME })
}
