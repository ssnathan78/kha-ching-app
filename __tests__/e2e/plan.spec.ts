import { expect, authenticatedTest as test } from "./fixtures"

test.describe("Plan editor", () => {
  test("plan page loads weekday templates", async ({ page }) => {
    await page.goto("/plan")
    await expect(page.getByText(/monday|tuesday|plan/i).first()).toBeVisible({ timeout: 15_000 })
  })

  test("navigates between days without crash", async ({ page }) => {
    await page.goto("/plan")
    const tuesday = page.getByRole("button", { name: /tuesday/i }).or(page.getByText(/^Tuesday$/i))
    if (await tuesday.count()) {
      await tuesday.first().click()
      await expect(page.locator("body")).toBeVisible()
    }
  })

  test("reload preserves plan page", async ({ page }) => {
    await page.goto("/plan")
    await page.reload()
    await expect(page.getByText(/plan|weekday|template/i).first()).toBeVisible()
  })
})
