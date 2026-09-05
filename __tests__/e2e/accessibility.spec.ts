import AxeBuilder from "@axe-core/playwright"

import { expect, authenticatedTest as test } from "./fixtures"

test.describe("Accessibility", () => {
  test("dashboard has no critical axe violations", async ({ page }) => {
    await page.goto("/dashboard")
    const results = await new AxeBuilder({ page }).analyze()
    const critical = results.violations.filter(v => v.impact === "critical")
    expect(critical).toEqual([])
  })

  test("plan page has no critical axe violations", async ({ page }) => {
    await page.goto("/plan")
    const results = await new AxeBuilder({ page }).analyze()
    const critical = results.violations.filter(v => v.impact === "critical")
    expect(critical).toEqual([])
  })

  test("chase page has no critical axe violations", async ({ page }) => {
    await page.goto("/chase")
    const results = await new AxeBuilder({ page }).analyze()
    const critical = results.violations.filter(v => v.impact === "critical")
    expect(critical).toEqual([])
  })
})
