import { defineConfig, devices } from "@playwright/test"

const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000"

export default defineConfig({
  globalSetup: "./__tests__/e2e/globalSetup.ts",
  testDir: "./__tests__/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "yarn start",
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NODE_ENV: "production",
      MOCK_ORDERS: "true",
      SESSION_COOKIE_SECURE: "false",
      TZ: "Asia/Kolkata",
      SECRET_COOKIE_PASSWORD: "test-secret-cookie-password-min-32-chars",
      DATABASE_URL:
        process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/trading_db",
      REDIS_URL: process.env.REDIS_URL || "redis://127.0.0.1:6379",
      KITE_API_KEY: process.env.KITE_API_KEY || "test_key",
      KITE_API_SECRET: process.env.KITE_API_SECRET || "test_secret",
    },
  },
})
