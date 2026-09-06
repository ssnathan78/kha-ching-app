import {
  selectedTradeInstruments,
  validateLots,
  validateSelectedInstruments,
} from "./strategyValidation"

export type PunchJobsResult =
  | { ok: true; instruments: string[] }
  | { ok: false; error: string; instruments: string[] }

/** Fan-out list for Schedule now / Schedule at. Empty instruments is a hard fail. */
export function jobsForPunch(input: {
  instruments?: Record<string, boolean | undefined> | null
  lots?: unknown
  maxLots?: number
}): PunchJobsResult {
  const lotsCheck = validateLots(input.lots, input.maxLots)
  if (!lotsCheck.ok) {
    return { ok: false, error: lotsCheck.error, instruments: [] }
  }
  const instrumentsCheck = validateSelectedInstruments(input.instruments)
  if (!instrumentsCheck.ok) {
    return { ok: false, error: instrumentsCheck.error, instruments: [] }
  }
  return { ok: true, instruments: selectedTradeInstruments(input.instruments) }
}
