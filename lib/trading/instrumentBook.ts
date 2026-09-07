import dayjs, { type Dayjs } from "dayjs"

import { INSTRUMENT_DETAILS, INSTRUMENTS } from "../constants"

export type InstrumentSlice = {
  name: string
  tradingsymbol: string
  instrumentType: string
  expiry: string
  lotSize: number
  strike: number
  instrumentToken: number
}

export type ChaseFuturesSelection = {
  front: InstrumentSlice | null
  next: InstrumentSlice | null
  /** Contracts Chase loads for EMA. On front-month expiry day this is front + next. */
  emaContracts: InstrumentSlice[]
  /** Contract new Chase entries use today. */
  newEntry: InstrumentSlice | null
}

export function expiryYmd(value: string | Date | null | undefined): string {
  if (!value) return ""
  return dayjs(value).format("YYYY-MM-DD")
}

export function fromKiteInstrument(row: {
  name?: string
  tradingsymbol?: string
  instrument_type?: string
  expiry?: string | Date
  lot_size?: number
  strike?: number
  instrument_token?: number
}): InstrumentSlice | null {
  if (!row.tradingsymbol || !row.instrument_type) return null
  return {
    name: String(row.name || ""),
    tradingsymbol: row.tradingsymbol,
    instrumentType: row.instrument_type,
    expiry: expiryYmd(row.expiry),
    lotSize: Number(row.lot_size) || 0,
    strike: Number(row.strike) || 0,
    instrumentToken: Number(row.instrument_token) || 0,
  }
}

export function futuresChain(
  rows: InstrumentSlice[],
  nfoSymbol: string,
  now: Dayjs = dayjs()
): InstrumentSlice[] {
  const today = now.startOf("day")
  return rows
    .filter(
      row =>
        row.name === nfoSymbol &&
        row.instrumentType === "FUT" &&
        (row.expiry ? dayjs(row.expiry).valueOf() >= today.valueOf() : false)
    )
    .sort((a, b) => dayjs(a.expiry).valueOf() - dayjs(b.expiry).valueOf())
}

export function chaseFuturesSelection(
  chain: InstrumentSlice[],
  now: Dayjs = dayjs()
): ChaseFuturesSelection {
  const front = chain[0] ?? null
  const next = chain[1] ?? null
  const expiryDay = Boolean(
    front?.expiry && dayjs(front.expiry).startOf("day").isSame(now.startOf("day"), "day")
  )
  const emaContracts = expiryDay && front && next ? [front, next] : front ? [front] : []
  return {
    front,
    next,
    emaContracts,
    newEntry: expiryDay && next ? next : front,
  }
}

export function optionExpiryDates(
  rows: InstrumentSlice[],
  nfoSymbol: string,
  now: Dayjs = dayjs()
): string[] {
  const today = now.startOf("day")
  return [
    ...new Set(
      rows
        .filter(
          row =>
            row.name === nfoSymbol &&
            (row.instrumentType === "CE" || row.instrumentType === "PE") &&
            row.expiry &&
            dayjs(row.expiry).valueOf() >= today.valueOf()
        )
        .map(row => row.expiry)
    ),
  ].sort()
}

/** Last option expiry in the current calendar month; else last in the following month. */
export function monthlyOptionExpiry(dates: string[], now: Dayjs = dayjs()): string | null {
  if (!dates.length) return null
  const month = now.month()
  const inMonth = dates.filter(d => dayjs(d).month() === month)
  if (inMonth.length) return inMonth[inMonth.length - 1]
  const nextMonth = month === 11 ? 0 : month + 1
  const inNext = dates.filter(d => dayjs(d).month() === nextMonth)
  return inNext.length ? inNext[inNext.length - 1] : dates[dates.length - 1]
}

export const DESK_INDEXES = [
  INSTRUMENTS.NIFTY,
  INSTRUMENTS.BANKNIFTY,
  INSTRUMENTS.FINNIFTY,
] as const

export function staticIndexMeta(index: (typeof DESK_INDEXES)[number]) {
  const details = INSTRUMENT_DETAILS[index]
  return {
    index,
    displayName: details.displayName,
    underlyingSymbol: details.underlyingSymbol,
    nfoSymbol: details.nfoSymbol,
    exchange: details.exchange,
    lotSize: details.lotSize,
    strikeStepSize: details.strikeStepSize,
    freezeQty: details.freezeQty,
    hasWeeklyExpiry: details.hasWeeklyExpiry,
  }
}
