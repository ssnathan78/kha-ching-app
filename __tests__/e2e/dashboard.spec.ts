import { expect, authenticatedTest as test } from "./fixtures"

test.describe("Dashboard", () => {
  test("loads Today tab and navigation", async ({ page }) => {
    await page.goto("/dashboard")
    await expect(page.getByRole("tab", { name: /today/i })).toBeVisible()
    await expect(page.getByRole("link", { name: /plan/i }).first()).toBeVisible()
  })

  test("New trade links are visible", async ({ page }) => {
    await page.goto("/dashboard")
    const newTradeTab = page.getByRole("tab", { name: /new trade/i })
    if (await newTradeTab.isVisible()) {
      await newTradeTab.click()
    }
    await expect(page.getByText(/straddle|strangle|chase/i).first()).toBeVisible()
  })
})
