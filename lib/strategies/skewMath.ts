/**
 * Pure skew threshold decay used by ATM straddle entry (exported for tests).
 */
export function computeUpdatedSkewPercent(
  fractionalTimeRemaining: number,
  maxSkewPercent: number,
  thresholdSkewPercent?: number
): number {
  if (!thresholdSkewPercent) {
    return maxSkewPercent
  }
  if (fractionalTimeRemaining >= 0.5) {
    return maxSkewPercent
  }
  return Math.round(
    fractionalTimeRemaining * maxSkewPercent + (1 - fractionalTimeRemaining) * thresholdSkewPercent
  )
}

export function isSkewAcceptable(liveSkew: number, threshold: number): boolean {
  return liveSkew <= threshold
}

export function shouldEnterAfterSkewTimeout(takeTradeIrrespectiveSkew: boolean): boolean {
  return takeTradeIrrespectiveSkew
}
