import { expect, authenticatedTest as test } from "./fixtures"

test.describe("Adversarial flows", () => {
  test("double navigation to straddle does not crash", async ({ page }) => {
    await page.goto("/strat/straddle")
    await page.goto("/strat/straddle")
    await expect(page.locator("body")).toBeVisible()
  })

  test("browser back from straddle returns to prior page", async ({ page }) => {
    await page.goto("/dashboard")
    await page.goto("/strat/straddle")
    await page.goBack()
    await expect(page).toHaveURL(/dashboard/)
  })

  test("refresh on dashboard keeps session", async ({ page }) => {
    await page.goto("/dashboard")
    await page.reload()
    await expect(page.getByText(/today/i).first()).toBeVisible()
  })
})
