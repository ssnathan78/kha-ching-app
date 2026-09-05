import { rngNormal } from "./rng"
import type { PricePathKind, VolatilityRegime } from "./types"

export const VOL_SCALE: Record<VolatilityRegime, number> = {
  very_low: 0.15,
  normal: 1,
  high: 2.4,
  extreme: 5,
  expansion: 3.2,
  contraction: 0.35,
}

export type PathSample = {
  mid: number
  note?: string
}

/**
 * Deterministic mid-price at progress ∈ [0, 1] for a named path.
 * Overnight/session gaps are applied by the market when the calendar jumps days.
 */
export function samplePricePath(args: {
  kind: PricePathKind
  progress: number
  start: number
  rng: () => number
  volatility: VolatilityRegime
  custom?: number[]
}): PathSample {
  const { kind, start, rng, volatility } = args
  const p = clamp01(args.progress)
  const vol = VOL_SCALE[volatility]
  const noise = () => rngNormal(rng) * start * 0.0008 * vol

  switch (kind) {
    case "flat":
      return { mid: start + noise() * 0.05 }
    case "uptrend":
      return { mid: start * (1 + 0.08 * p) + noise() }
    case "downtrend":
      return { mid: start * (1 - 0.08 * p) + noise() }
    case "sideways":
      return { mid: start + Math.sin(p * Math.PI * 6) * start * 0.012 * vol + noise() * 0.4 }
    case "choppy":
      return { mid: start + (rng() > 0.5 ? 1 : -1) * start * 0.004 * vol + noise() }
    case "breakout":
      return {
        mid: p < 0.7 ? start + noise() * 0.3 : start * (1 + 0.06 * ((p - 0.7) / 0.3)) + noise(),
      }
    case "reversal":
      return {
        mid:
          p < 0.55
            ? start * (1 + 0.07 * (p / 0.55)) + noise()
            : start * (1.07 - 0.12 * ((p - 0.55) / 0.45)) + noise(),
      }
    case "volatility_spike":
      return {
        mid: start + (p < 0.6 ? noise() * 0.4 : noise() * 6),
      }
    case "crash":
      return { mid: start * (1 - 0.22 * easeIn(p)) + noise() }
    case "rally":
      return { mid: start * (1 + 0.22 * easeIn(p)) + noise() }
    case "gap_up":
      return {
        mid: p === 0 ? start : start * 1.15 + noise() * 0.2,
        note: p > 0 ? "gap_up" : undefined,
      }
    case "gap_down":
      return {
        mid: p === 0 ? start : start * 0.85 + noise() * 0.2,
        note: p > 0 ? "gap_down" : undefined,
      }
    case "flash_crash":
      if (p < 0.35) return { mid: start + noise() * 0.3 }
      if (p < 0.5) return { mid: start * (1 - 0.18 * ((p - 0.35) / 0.15)) + noise() }
      return { mid: start * (0.82 + 0.14 * ((p - 0.5) / 0.5)) + noise() }
    case "flash_rally":
      if (p < 0.35) return { mid: start + noise() * 0.3 }
      if (p < 0.5) return { mid: start * (1 + 0.18 * ((p - 0.35) / 0.15)) + noise() }
      return { mid: start * (1.18 - 0.14 * ((p - 0.5) / 0.5)) + noise() }
    case "custom":
      if (!args.custom?.length) return { mid: start }
      {
        const idx = Math.min(args.custom.length - 1, Math.floor(p * args.custom.length))
        return { mid: args.custom[idx] }
      }
    default:
      return { mid: start }
  }
}

function clamp01(n: number): number {
  if (n <= 0) return 0
  if (n >= 1) return 1
  return n
}

function easeIn(p: number): number {
  return p * p
}

export function applyOvernightGap(
  prevClose: number,
  kind: PricePathKind,
  rng: () => number
): number {
  if (kind === "gap_up") return roundPx(prevClose * 1.15)
  if (kind === "gap_down") return roundPx(prevClose * 0.85)
  const jump = (rng() - 0.5) * 0.01
  return roundPx(prevClose * (1 + jump))
}

export function roundPx(n: number): number {
  return Math.round(n * 100) / 100
}
