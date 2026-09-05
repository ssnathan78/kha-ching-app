import { applyAuthCookie } from "../support/playwrightAuth"
import { expect, test } from "./fixtures"

test.describe("Authentication", () => {
  test("unauthenticated dashboard redirects to login", async ({ page, baseURL }) => {
    await page.goto("/dashboard")
    await page.waitForURL(/\/(\?.*)?$/, { timeout: 15_000 })
    expect(page.url()).toMatch(/\/$/)
  })

  test("login page shows Continue with Kite", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("button", { name: /continue with kite/i })).toBeVisible()
  })

  test("authenticated user can open dashboard", async ({ page, context, baseURL }) => {
    if (!baseURL) return
    await applyAuthCookie(context, baseURL)
    await page.goto("/dashboard")
    await expect(page.getByText(/today/i).first()).toBeVisible({ timeout: 15_000 })
  })
})
