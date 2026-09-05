import { simulate } from "../../lib/simulation/runner"
import type { LiquidityRegime, PricePathKind, VolatilityRegime } from "../../lib/simulation/types"

const PATHS: PricePathKind[] = [
  "flat",
  "uptrend",
  "downtrend",
  "choppy",
  "crash",
  "rally",
  "flash_crash",
]
const VOLS: VolatilityRegime[] = ["very_low", "normal", "high"]
const LIQS: LiquidityRegime[] = ["high", "normal", "low"]

describe("seeded property simulations", () => {
  it.each([1, 2, 3, 7, 13, 42, 99, 12345])("seed %s keeps invariants", seed => {
    const path = PATHS[seed % PATHS.length]
    const volatility = VOLS[seed % VOLS.length]
    const liquidity = LIQS[seed % LIQS.length]
    const result = simulate({
      scenario: "random",
      seed,
      start: "2026-09-07 09:15",
      end: "2026-09-07 15:30",
      stepMinutes: 10,
      pricePath: path,
      volatility,
      liquidity,
      actors: [
        {
          kind: "straddle",
          strategy: "ATM_STRADDLE",
          symbol: "NIFTY26SEPFUT",
          lots: 1,
          fireAt: "09:20",
        },
      ],
    })
    if (result.invariantViolations.length) {
      throw new Error(
        `property failure seed=${seed} path=${path} vol=${volatility} liq=${liquidity}\n${result.invariantViolations.join("\n")}`
      )
    }
    expect(result.orders.every(o => o.filledQty <= o.quantity)).toBe(true)
  })
})
