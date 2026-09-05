import type { ChaseEngineConfig } from "./chaseDefaults"
import { INSTRUMENTS } from "./constants"

const CHASE_INDEXES = new Set<string>([
  INSTRUMENTS.NIFTY,
  INSTRUMENTS.BANKNIFTY,
  INSTRUMENTS.FINNIFTY,
])

export type ChaseValidationResult =
  | { ok: true; config: ChaseEngineConfig }
  | { ok: false; error: string }

export function normalizeChaseInstruments(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.map(String) : []
  const unique = [...new Set(list.filter(item => CHASE_INDEXES.has(item)))]
  return unique.length ? unique : ["NIFTY"]
}

export function validateChaseSettings(
  patch: Partial<ChaseEngineConfig>,
  opts?: { maxLots?: number }
): ChaseValidationResult {
  if (patch.lots != null) {
    const n = Number(patch.lots)
    if (!Number.isFinite(n) || n < 1 || !Number.isInteger(n)) {
      return { ok: false, error: "lots must be an integer >= 1" }
    }
    if (opts?.maxLots != null && n > opts.maxLots) {
      return {
        ok: false,
        error: `lots exceeds the Chase risk cap of ${opts.maxLots} (Desk → Risk)`,
      }
    }
  }
  if (patch.instruments != null) {
    if (!Array.isArray(patch.instruments) || patch.instruments.length === 0) {
      return { ok: false, error: "Select at least one index for Chase" }
    }
    if (patch.instruments.some(item => !CHASE_INDEXES.has(String(item)))) {
      return { ok: false, error: "Chase instruments must be NIFTY, BANKNIFTY, or FINNIFTY" }
    }
  }
  if (patch.emaPeriod != null) {
    const n = Number(patch.emaPeriod)
    if (!Number.isFinite(n) || n < 1 || n > 500) {
      return { ok: false, error: "emaPeriod must be between 1 and 500" }
    }
  }
  if (patch.bufferPercent != null) {
    const n = Number(patch.bufferPercent)
    if (!Number.isFinite(n) || n < 0 || n > 10) {
      return { ok: false, error: "bufferPercent must be between 0 and 10" }
    }
  }
  if (patch.entryLimitOffset != null) {
    const n = Number(patch.entryLimitOffset)
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return { ok: false, error: "entryLimitOffset must be between 0 and 100" }
    }
  }

  return { ok: true, config: patch as ChaseEngineConfig }
}
