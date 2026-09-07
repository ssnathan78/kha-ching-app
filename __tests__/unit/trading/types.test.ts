import { parseTradeBook, provenanceInBook } from "../../../lib/trading/types"

describe("parseTradeBook", () => {
  it("accepts PAPER and LIVE and defaults the rest to ALL", () => {
    expect(parseTradeBook("PAPER")).toBe("PAPER")
    expect(parseTradeBook("LIVE")).toBe("LIVE")
    expect(parseTradeBook("ALL")).toBe("ALL")
    expect(parseTradeBook("nope")).toBe("ALL")
    expect(parseTradeBook(undefined)).toBe("ALL")
  })
})

describe("provenanceInBook", () => {
  it("puts PAPER and MOCK in the paper book", () => {
    expect(provenanceInBook("PAPER", "PAPER")).toBe(true)
    expect(provenanceInBook("MOCK", "PAPER")).toBe(true)
    expect(provenanceInBook("LIVE", "PAPER")).toBe(false)
  })

  it("puts LIVE, RECONCILED, and MIGRATED in the live book", () => {
    expect(provenanceInBook("LIVE", "LIVE")).toBe(true)
    expect(provenanceInBook("RECONCILED", "LIVE")).toBe(true)
    expect(provenanceInBook("MIGRATED", "LIVE")).toBe(true)
    expect(provenanceInBook("PAPER", "LIVE")).toBe(false)
    expect(provenanceInBook("MOCK", "LIVE")).toBe(false)
  })
})
