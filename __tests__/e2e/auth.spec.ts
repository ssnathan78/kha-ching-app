import { expect, test } from "@playwright/test"

import { authenticatedTest } from "./fixtures"

test.describe("Authentication", () => {
  test("unauthenticated dashboard redirects to login", async ({ page }) => {
    await page.goto("/dashboard")
    await page.waitForURL(/\/(\?.*)?$/, { timeout: 15_000 })
    expect(page.url()).toMatch(/\/$/)
  })

  test("login page shows Continue with Kite", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByText(/continue with kite/i)).toBeVisible()
  })
})

authenticatedTest("authenticated user can open dashboard", async ({ page }) => {
  await page.goto("/dashboard")
  await expect(page.getByRole("tab", { name: "Today", exact: true })).toBeVisible({
    timeout: 15_000,
  })
})
