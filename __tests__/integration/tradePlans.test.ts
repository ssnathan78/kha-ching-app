import { Pool } from "pg"

import { mapPlanToDb } from "../../lib/planMapper"

const databaseUrl = process.env.DATABASE_URL
const describeDb = databaseUrl ? describe : describe.skip

const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const
const PLAN_STRATEGIES = ["ATM_STRADDLE", "ATM_STRANGLE"] as const

const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null

afterAll(async () => {
  await pool?.end()
})

type Queryable = { query: Pool["query"] }

async function insertMapped(client: Queryable, mapped: Record<string, unknown>) {
  const columns: Record<string, unknown> = {
    name: mapped.name,
    strategy: mapped.strategy,
    instrument: mapped.instrument,
    expiry_type: mapped.expiryType,
    product_type: mapped.productType,
    day_of_week: mapped.dayOfWeek,
    exit_strategy: mapped.exitStrategy,
    combined_exit_strategy: mapped.combinedExitStrategy,
    lots: mapped.lots,
    sl_order_type: mapped.slOrderType,
    sl_limit_price_percent: mapped.slLimitPricePercent,
    volatility_type: mapped.volatilityType,
    trail_every_percentage_change_value: mapped.trailEveryPercentageChangeValue,
    is_auto_square_off_enabled: mapped.isAutoSquareOffEnabled,
  }
  const keys = Object.keys(columns).filter(key => columns[key] !== undefined)
  const values = keys.map(key => columns[key])
  const placeholders = keys.map((_, i) => `$${i + 1}`)
  const { rows } = await client.query(
    `INSERT INTO trade_plans (${keys.join(", ")}) VALUES (${placeholders.join(", ")})
     RETURNING id, name, lots, day_of_week, strategy`,
    values
  )
  return rows[0]
}

describeDb("trade_plans uniqueness", () => {
  const ids: string[] = []

  beforeAll(async () => {
    await pool!.query(
      `DELETE FROM trade_plans WHERE day_of_week = 'SATURDAY' AND strategy = 'ATM_STRADDLE'`
    )
  })

  afterAll(async () => {
    if (ids.length) {
      await pool!.query(`DELETE FROM trade_plans WHERE id = ANY($1::text[])`, [ids])
    }
  })

  it("rejects a second row for the same weekday + strategy", async () => {
    const mapped = mapPlanToDb(
      {
        name: "jest-uniqueness",
        strategy: "ATM_STRADDLE",
        instrument: "NIFTY",
        expiryType: "CURRENT",
        productType: "MIS",
        lots: 1,
      },
      "SATURDAY"
    )
    const first = await insertMapped(pool!, mapped)
    ids.push(first.id)

    await expect(insertMapped(pool!, { ...mapped, name: "duplicate" })).rejects.toThrow()
  })
})

describeDb("trade_plans save (UI payloads)", () => {
  it("inserts Tuesday ATM_STRANGLE when the form omits name and lots", async () => {
    const client = await pool!.connect()
    try {
      await client.query("BEGIN")
      await client.query(
        `DELETE FROM trade_plans WHERE day_of_week = 'TUESDAY' AND strategy = 'ATM_STRANGLE'`
      )
      const row = await insertMapped(
        client,
        mapPlanToDb(
          {
            strategy: "ATM_STRANGLE",
            instrument: "NIFTY",
            expiryType: "CURRENT",
            productType: "MIS",
            exitStrategy: "NO_SL",
            combinedExitStrategy: "EXIT_ALL",
            lots: null,
            slOrderType: "SLL",
            slLimitPricePercent: 1,
            volatilityType: "SHORT",
            trailEveryPercentageChangeValue: 2,
            isAutoSquareOffEnabled: true,
          },
          "TUESDAY"
        )
      )
      expect(row.day_of_week).toBe("TUESDAY")
      expect(row.strategy).toBe("ATM_STRANGLE")
      expect(row.name).toBe("ATM Strangle")
      expect(Number(row.lots)).toBe(1)
      await client.query("ROLLBACK")
    } finally {
      client.release()
    }
  })

  it("inserts every weekday for both intraday strategies", async () => {
    const client = await pool!.connect()
    try {
      await client.query("BEGIN")
      const saved: { day_of_week: string; strategy: string; lots: number }[] = []
      for (const dayOfWeek of WEEKDAYS) {
        for (const strategy of PLAN_STRATEGIES) {
          await client.query(`DELETE FROM trade_plans WHERE day_of_week = $1 AND strategy = $2`, [
            dayOfWeek,
            strategy,
          ])
          const row = await insertMapped(
            client,
            mapPlanToDb(
              {
                name: `jest-matrix-${dayOfWeek}-${strategy}`,
                strategy,
                instrument: "NIFTY",
                expiryType: "CURRENT",
                productType: "MIS",
                exitStrategy: strategy === "ATM_STRANGLE" ? "NO_SL" : "INDIVIDUAL_LEG_SLM_1X",
                lots: 2,
              },
              dayOfWeek
            )
          )
          saved.push({
            day_of_week: row.day_of_week,
            strategy: row.strategy,
            lots: Number(row.lots),
          })
        }
      }
      expect(saved).toHaveLength(WEEKDAYS.length * PLAN_STRATEGIES.length)
      for (const dayOfWeek of WEEKDAYS) {
        for (const strategy of PLAN_STRATEGIES) {
          const row = saved.find(r => r.day_of_week === dayOfWeek && r.strategy === strategy)
          expect(row?.lots).toBe(2)
        }
      }
      await client.query("ROLLBACK")
    } finally {
      client.release()
    }
  })
})

describeDb("strategy_defaults", () => {
  it("has a master row for each intraday plan strategy", async () => {
    for (const strategy of PLAN_STRATEGIES) {
      const { rows } = await pool!.query(
        `SELECT strategy FROM strategy_defaults WHERE strategy = $1`,
        [strategy]
      )
      expect(rows[0]?.strategy).toBe(strategy)
    }
  })
})

describeDb("chase_settings", () => {
  it("has exactly one Chase plan row", async () => {
    const { rows } = await pool!.query(`SELECT id, lots, paused FROM chase_settings`)
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].id)).toBe(1)
    expect(Number(rows[0].lots)).toBeGreaterThanOrEqual(1)
    expect(typeof rows[0].paused).toBe("boolean")
  })
})

describeDb("trade_plans extras", () => {
  it("has an extras jsonb column", async () => {
    const { rows } = await pool!.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_name = 'trade_plans' AND column_name = 'extras'`
    )
    expect(rows[0]?.data_type).toBe("jsonb")
  })
})
