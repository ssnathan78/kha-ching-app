import { expect, authenticatedTest as test } from "./fixtures"

const PHONE = { width: 390, height: 844 }

async function pageOverflowsHorizontally(page: {
  evaluate: (fn: () => boolean) => Promise<boolean>
}) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2
  )
}

test.describe("Mobile layout", () => {
  test.use({ viewport: PHONE })

  test("dashboard shell uses the drawer and does not overflow", async ({ page }) => {
    await page.goto("/dashboard")
    await expect(page.getByRole("button", { name: /open menu/i })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole("tab", { name: "Today", exact: true })).toBeVisible()
    expect(await pageOverflowsHorizontally(page)).toBe(false)
  })

  test("desk tables stay inside the viewport", async ({ page }) => {
    await page.goto("/desk")
    await expect(page.getByRole("tab", { name: /positions/i })).toBeVisible({ timeout: 20_000 })
    expect(await pageOverflowsHorizontally(page)).toBe(false)

    await page.getByRole("tab", { name: /alerts/i }).click()
    await expect(page.getByRole("button", { name: /clear today/i })).toBeVisible()
    expect(await pageOverflowsHorizontally(page)).toBe(false)

    await page.getByRole("tab", { name: /risk/i }).click()
    await expect(page.getByRole("heading", { name: "Risk limits" })).toBeVisible()
    expect(await pageOverflowsHorizontally(page)).toBe(false)
  })

  test("plan and chase pages do not overflow", async ({ page }) => {
    await page.goto("/plan")
    await expect(page.getByRole("button", { name: /by day/i })).toBeVisible({ timeout: 20_000 })
    expect(await pageOverflowsHorizontally(page)).toBe(false)

    await page.goto("/chase")
    await expect(page.getByRole("heading", { name: /chase/i })).toBeVisible({ timeout: 20_000 })
    expect(await pageOverflowsHorizontally(page)).toBe(false)
  })
})
