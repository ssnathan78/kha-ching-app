import { expect, authenticatedTest as test } from "./fixtures"

test.describe("Chase settings", () => {
  test("chase page loads config form", async ({ page }) => {
    await page.goto("/chase")
    await expect(page.getByText(/chase|ema|lots/i).first()).toBeVisible({ timeout: 15_000 })
  })

  test("save settings shows no crash", async ({ page }) => {
    await page.goto("/chase")
    const saveBtn = page.getByRole("button", { name: /save/i })
    if (await saveBtn.isVisible()) {
      await saveBtn.click()
      await expect(page.locator("body")).toBeVisible()
    }
  })
})
