import { expect, authenticatedTest as test } from "./fixtures"

test.describe("Straddle Schedule now", () => {
  test("Nifty ticked + Schedule now creates a Today job", async ({ page }) => {
    page.on("dialog", dialog => dialog.accept())
    await page.goto("/strat/straddle")
    await expect(page.getByRole("button", { name: /schedule now/i })).toBeVisible({
      timeout: 20_000,
    })
    const nifty = page.getByRole("checkbox", { name: /nifty/i }).first()
    if (await nifty.count()) {
      await expect(nifty).toBeChecked()
    }
    await page.getByRole("button", { name: /schedule now/i }).click()
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 })
    await expect(page.getByRole("tab", { name: /today/i })).toBeVisible()
    await expect(page.getByText(/job|scheduled|straddle/i).first()).toBeVisible()
  })

  test("unticking every index stays on the form and does not POST", async ({ page }) => {
    let posted = false
    await page.route("**/api/trades_day", async route => {
      if (route.request().method() === "POST") posted = true
      await route.continue()
    })
    await page.goto("/strat/straddle")
    await expect(page.getByRole("button", { name: /schedule now/i })).toBeVisible({
      timeout: 20_000,
    })
    const boxes = page.getByRole("checkbox")
    const count = await boxes.count()
    for (let i = 0; i < count; i += 1) {
      const box = boxes.nth(i)
      if (await box.isChecked()) await box.uncheck()
    }
    await page.getByRole("button", { name: /schedule now/i }).click()
    await expect(page).toHaveURL(/\/strat\/straddle/)
    await expect(page.getByText(/tick at least one index/i)).toBeVisible()
    expect(posted).toBe(false)
  })
})

test.describe("Today's plan Schedule all", () => {
  test("past template times show an error instead of a silent no-op", async ({ page }) => {
    const runAt = new Date()
    runAt.setHours(8, 0, 0, 0)
    const seed = await page.request.post("/api/plan", {
      data: {
        dayOfWeek: new Date().toLocaleDateString("en-US", {
          weekday: "long",
          timeZone: "Asia/Kolkata",
        }).toUpperCase(),
        config: {
          strategy: "ATM_STRADDLE",
          name: "E2E past plan",
          instrument: "NIFTY",
          lots: 1,
          volatilityType: "SHORT",
          productType: "MIS",
          expiryType: "CURRENT",
          exitStrategy: "INDIVIDUAL_LEG_SLM_1X",
          slmPercent: 30,
          maxSkewPercent: 10,
          thresholdSkewPercent: 20,
          isAutoSquareOffEnabled: true,
          runAt: runAt.toISOString(),
        },
      },
    })
    await page.goto("/dashboard?tabId=2")
    await expect(page.getByText(/today's plan|plan|template/i).first()).toBeVisible({
      timeout: 15_000,
    })
    const scheduleAll = page.getByRole("button", { name: /schedule all/i })
    if ((await scheduleAll.count()) && seed.ok()) {
      await scheduleAll.click()
      await expect(page.getByText(/already passed|run now|schedule now/i)).toBeVisible({
        timeout: 10_000,
      })
    }
  })
})
