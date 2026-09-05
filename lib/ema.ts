import type { HistoricalData } from "kiteconnect"

import { now } from "./clock"
import logger from "./logger"

/**
 * EMA of typical price (H+L+C)/3 over `period` hourly bars.
 * High/low/close stats are taken from candles whose UTC date matches today.
 */
export const calculateEmaFromCandles = (
  candles: HistoricalData[],
  prevEMA: number | null = null,
  period = 40
): {
  ema: number
  highestHigh: number
  lowestLow: number
  lastClose: number
} | null => {
  const multiplier = 2 / (period + 1)

  const today = now().toISOString().split("T")[0]
  const filteredCandles = candles.filter(candle => candle.date.toISOString().startsWith(today))

  if (filteredCandles.length === 0) {
    logger.error("ema.calculateEmaFromCandles: No candles found for the date", {
      date: today,
      candleCount: candles.length,
    })
    return null
  }

  if (prevEMA === null && candles.length < period) {
    logger.error("ema.calculateEmaFromCandles: Not enough candles for the calculation", {
      candleCount: candles.length,
      required: period,
    })
    return null
  }

  const highestHigh = Math.round(Math.max(...filteredCandles.map(candle => candle.high)))
  const lowestLow = Math.round(Math.min(...filteredCandles.map(candle => candle.low)))
  const lastClose = Math.round(filteredCandles[filteredCandles.length - 1].close)

  const hlcValues = candles.map(candle => (candle.high + candle.low + candle.close) / 3)

  let ema: number
  if (prevEMA === null) {
    const sma = hlcValues.slice(0, period).reduce((acc, value) => acc + value, 0) / period
    const emaArray = [sma]

    for (let i = period; i < hlcValues.length; i++) {
      emaArray.push(hlcValues[i] * multiplier + emaArray[emaArray.length - 1] * (1 - multiplier))
    }

    ema = emaArray[emaArray.length - 1]
  } else {
    ema = hlcValues[hlcValues.length - 1] * multiplier + prevEMA * (1 - multiplier)
  }

  logger.info("[ema.calculateEmaFromCandles]: Calculated EMA", {
    ema,
    highestHigh,
    lowestLow,
    lastClose,
    period,
  })

  return {
    ema: Math.round(ema),
    highestHigh,
    lowestLow,
    lastClose,
  }
}

/** @deprecated Use calculateEmaFromCandles. Kept as the historical name used by Chase. */
export const calculate40EMA = calculateEmaFromCandles
