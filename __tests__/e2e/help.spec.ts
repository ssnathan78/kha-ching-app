import { expect, authenticatedTest as test } from "./fixtures"

test.describe("Help", () => {
  test("help index lists topics", async ({ page }) => {
    await page.goto("/help")
    await expect(page.getByText(/desk|plan|straddle|strangle|chase/i).first()).toBeVisible()
  })

  test("help topic pages load", async ({ page }) => {
    await page.goto("/help/desk")
    await expect(page.getByRole("heading").first()).toBeVisible()
  })
})

test.describe("Profile", () => {
  test("profile page renders", async ({ page }) => {
    await page.goto("/profile")
    await expect(page.getByText(/profile|user|broker/i).first()).toBeVisible()
  })
})
