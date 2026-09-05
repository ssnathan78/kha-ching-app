import { readFileSync } from "fs"
import { resolve } from "path"

describe("schema guardrails", () => {
  it("enforces one trade plan per weekday and strategy", () => {
    const sql = readFileSync(
      resolve(__dirname, "../../drizzle/0001_plan_uniqueness_and_defaults.sql"),
      "utf8"
    )
    expect(sql).toContain("trade_plans_day_strategy_uidx")
    expect(sql).toContain("strategy_defaults")
  })

  it("stores Chase as a single settings row, not weekday templates", () => {
    const sql = readFileSync(resolve(__dirname, "../../drizzle/0002_chase_settings.sql"), "utf8")
    expect(sql).toContain("chase_settings")
    expect(sql).toContain("paused")
    expect(sql).toContain("DELETE FROM trade_plans WHERE strategy = 'SUBSCRIBE_CHASE'")
  })

  it("adds extras jsonb for strangle entry fields", () => {
    const sql = readFileSync(resolve(__dirname, "../../drizzle/0003_plan_extras.sql"), "utf8")
    expect(sql).toContain("extras jsonb")
  })

  it("keeps the dual P&L ADR in tree", () => {
    const adr = readFileSync(resolve(__dirname, "../../docs/adr/0002-dual-pnl-metrics.md"), "utf8")
    expect(adr.toLowerCase()).toMatch(/points/)
    expect(adr.toLowerCase()).toMatch(/rupee/)
  })
})
