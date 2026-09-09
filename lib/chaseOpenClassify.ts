import type { HistoricalData } from "kiteconnect"

import { CHASE_OPEN_CLASSIFY, type ChaseOpenClassify } from "./chaseDefaults"

export type ChaseMorningBar = Pick<HistoricalData, "high" | "low" | "close">

export type ChaseMorningSnapshot = {
  ema: number
  lastClose: number
  lowestLow: number
  highestHigh: number
}

export function isChaseOpenClassify(value: unknown): value is ChaseOpenClassify {
  return value === CHASE_OPEN_CLASSIFY.PDF_0916 || value === CHASE_OPEN_CLASSIFY.LEGACY_60M
}

/** Unknown or missing values become the PDF 09:16 classifier. */
export function normalizeChaseOpenClassify(raw: unknown): ChaseOpenClassify {
  return raw === CHASE_OPEN_CLASSIFY.LEGACY_60M
    ? CHASE_OPEN_CLASSIFY.LEGACY_60M
    : CHASE_OPEN_CLASSIFY.PDF_0916
}

/**
 * 09:16 inputs for T+1 / later-day SL.
 * PDF: overnight hourly EMA + session bars from 09:15 to 09:16 (close, day's H/L).
 * Legacy: stepped 40-EMA on the last 60-minute bar (Anil kha-ching port).
 */
export function resolveChaseMorningSnapshot(input: {
  openClassify: ChaseOpenClassify
  overnightEma: number
  steppedHourly: ChaseMorningSnapshot | null
  sessionBars: ChaseMorningBar[]
}): ChaseMorningSnapshot | null {
  if (input.openClassify === CHASE_OPEN_CLASSIFY.LEGACY_60M) {
    return input.steppedHourly
  }
  if (!input.sessionBars.length) {
    return null
  }
  const last = input.sessionBars[input.sessionBars.length - 1]
  return {
    ema: Math.round(input.overnightEma),
    lastClose: Math.round(last.close),
    highestHigh: Math.ceil(Math.max(...input.sessionBars.map(bar => bar.high))),
    lowestLow: Math.floor(Math.min(...input.sessionBars.map(bar => bar.low))),
  }
}
