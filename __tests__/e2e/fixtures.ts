import { test as base, expect } from "@playwright/test"

import { applyAuthCookie, clearAuthCookie } from "../support/playwrightAuth"

const mockUser = {
  isLoggedIn: true,
  user_id: "TEST001",
  user_name: "Test User",
  email: "test@example.com",
  broker: "ZERODHA",
}

export const test = base.extend({
  page: async ({ page, baseURL }, use) => {
    await page.route("**/api/user", async route => {
      await route.fulfill({ json: mockUser })
    })
    await use(page)
  },
})

export const authenticatedTest = base.extend({
  page: async ({ page, context, baseURL }, use) => {
    if (!baseURL) throw new Error("baseURL required")
    await page.route("**/api/user", async route => {
      await route.fulfill({ json: mockUser })
    })
    await applyAuthCookie(context, baseURL)
    await use(page)
  },
})

export { expect }
