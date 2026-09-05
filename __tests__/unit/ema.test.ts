import type { HistoricalData } from "kiteconnect"
import { calculateEmaFromCandles } from "../../lib/ema"

function candle(partial: {
  high: number
  low: number
  close: number
  date?: Date
}): HistoricalData {
  return {
    date: partial.date ?? new Date(),
    open: partial.close,
    high: partial.high,
    low: partial.low,
    close: partial.close,
    volume: 1,
  } as HistoricalData
}

describe("calculateEmaFromCandles", () => {
  it("returns null when no candle falls on today's UTC date", () => {
    const yesterday = new Date(Date.now() - 36 * 60 * 60 * 1000)
    expect(
      calculateEmaFromCandles([candle({ high: 10, low: 8, close: 9, date: yesterday })], null, 1)
    ).toBeNull()
  })

  it("returns null when there are fewer bars than the period and no previous EMA", () => {
    expect(calculateEmaFromCandles([candle({ high: 11, low: 9, close: 10 })], null, 5)).toBeNull()
  })

  it("uses SMA of typical price as the seed when period matches bar count", () => {
    const bars = [10, 12, 14, 16, 18].map(close =>
      candle({ high: close + 1, low: close - 1, close })
    )
    const result = calculateEmaFromCandles(bars, null, 5)
    expect(result).not.toBeNull()
    // typical price = close for these bars; SMA = 14
    expect(result?.ema).toBe(14)
    expect(result?.highestHigh).toBe(19)
    expect(result?.lowestLow).toBe(9)
    expect(result?.lastClose).toBe(18)
  })

  it("updates from prevEMA with the last typical price", () => {
    const bars = [candle({ high: 101, low: 99, close: 100 })]
    const period = 40
    const multiplier = 2 / (period + 1)
    const prev = 90
    const expected = Math.round(100 * multiplier + prev * (1 - multiplier))
    expect(calculateEmaFromCandles(bars, prev, period)?.ema).toBe(expected)
  })
})
