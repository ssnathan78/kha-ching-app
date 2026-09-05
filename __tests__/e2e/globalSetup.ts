import { execSync } from "node:child_process"

export default async function globalSetup() {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/trading_db"
  }
  if (!process.env.REDIS_URL) {
    process.env.REDIS_URL = "redis://127.0.0.1:6379"
  }

  try {
    execSync("yarn migrate", { stdio: "inherit", env: process.env })
  } catch (e) {
    console.warn("[playwright globalSetup] migrate skipped or failed:", e)
  }
}
