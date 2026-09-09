export const CHASE_OPEN_CLASSIFY = {
  PDF_0916: "pdf_0916",
  LEGACY_60M: "legacy_60m",
} as const

export type ChaseOpenClassify = (typeof CHASE_OPEN_CLASSIFY)[keyof typeof CHASE_OPEN_CLASSIFY]

export type ChaseEngineConfig = {
  lots: number
  emaPeriod: number
  bufferPercent: number
  entryLimitOffset: number
  paused: boolean
  instruments: string[]
  /** How 09:16 T+1 / later-day SL reads close, EMA, and day's H/L. */
  openClassify: ChaseOpenClassify
}

export const CHASE_MASTER_DEFAULTS: ChaseEngineConfig = {
  lots: 1,
  emaPeriod: 40,
  bufferPercent: 0.2,
  entryLimitOffset: 5,
  paused: false,
  instruments: ["NIFTY"],
  openClassify: CHASE_OPEN_CLASSIFY.PDF_0916,
}

export function chaseTolerances(ema: number, bufferPercent: number) {
  const fraction = bufferPercent / 100
  return {
    longTolerance: ema * (1 + fraction),
    shortTolerance: ema * (1 - fraction),
  }
}

const OPEN_POSITION = new Set(["LONG", "SHORT"])

/** When paused, do not open a new Chase futures position. */
export function chaseAllowsNewEntry(paused: boolean): boolean {
  return !paused
}

/** Open LONG/SHORT (and their stops) keep running until the position is flat. */
export function chaseManagesOpenPosition(
  paused: boolean,
  status: string | null | undefined
): boolean {
  return OPEN_POSITION.has(status ?? "")
}
