import { EXIT_STRATEGIES, STRANGLE_ENTRY_STRATEGIES } from "../../lib/constants"
import { exitStrategyLabel, strangleEntryLabel } from "../../lib/planLabels"

describe("plan labels", () => {
  it("does not throw when a saved strangle has no entryStrategy", () => {
    expect(strangleEntryLabel(undefined)).toMatch(/distance from ATM/i)
    expect(strangleEntryLabel(null)).toMatch(/distance from ATM/i)
    expect(strangleEntryLabel(STRANGLE_ENTRY_STRATEGIES.ENTRY_PRICE)).toMatch(/price/i)
  })

  it("does not throw when exitStrategy is missing from a saved row", () => {
    expect(exitStrategyLabel(undefined)).toBe("—")
    expect(exitStrategyLabel("UNKNOWN")).toBe("UNKNOWN")
    expect(exitStrategyLabel(EXIT_STRATEGIES.NO_SL)).toBe("No SL")
  })
})
