import dayjs from "dayjs"

import { getChaseSettings } from "../chaseSettings"
import { nowDayjs } from "../clock"
import { getChaseStatus } from "../drizzleDbUtils"
import { getIndexInstruments } from "../kiteUtils"
import logger from "../logger"
import {
  chaseFuturesSelection,
  DESK_INDEXES,
  fromKiteInstrument,
  futuresChain,
  type InstrumentSlice,
  monthlyOptionExpiry,
  optionExpiryDates,
  staticIndexMeta,
} from "./instrumentBook"

export type DeskIndexContracts = ReturnType<typeof staticIndexMeta> & {
  chaseEnabled: boolean
  chaseStatus: string | null
  chaseTradingsymbol: string | null
  chaseStoploss: number | null
  chaseEntryPoint: number | null
  frontFut: InstrumentSlice | null
  nextFut: InstrumentSlice | null
  chaseEmaContracts: InstrumentSlice[]
  chaseNewEntry: InstrumentSlice | null
  optionCurrentExpiry: string | null
  optionNextExpiry: string | null
  optionMonthlyExpiry: string | null
}

export type DeskInstrumentSnapshot = {
  fetchedAt: string
  source: "KITE_NFO" | "STATIC_ONLY"
  cacheNote: string
  kiteError: string | null
  chase: {
    lots: number
    paused: boolean
    instruments: string[]
    emaPeriod: number
    bufferPercent: number
    entryLimitOffset: number
  }
  indexes: DeskIndexContracts[]
}

const CACHE_NOTE =
  "Kite NFO master is fetched at process start / first use and cached until 07:00 IST. Contract names are not stored in Postgres. Chase only stores the selected indexes and, once in a trade, chase_status.tradingsymbol."

export async function buildDeskInstrumentSnapshot(input?: {
  instruments?: InstrumentSlice[]
}): Promise<DeskInstrumentSnapshot> {
  const now = nowDayjs()
  const chase = await getChaseSettings()
  const selected = new Set(chase.instruments)

  let slices: InstrumentSlice[] = input?.instruments ?? []
  let kiteError: string | null = null
  let source: DeskInstrumentSnapshot["source"] = input?.instruments ? "KITE_NFO" : "STATIC_ONLY"

  if (!input?.instruments) {
    try {
      const raw = await getIndexInstruments()
      slices = raw.map(fromKiteInstrument).filter((row): row is InstrumentSlice => Boolean(row))
      source = "KITE_NFO"
    } catch (e) {
      kiteError = e instanceof Error ? e.message : String(e)
      logger.warn("[deskInstruments] Kite instrument dump unavailable", e)
    }
  }

  const indexes: DeskIndexContracts[] = []
  for (const index of DESK_INDEXES) {
    const meta = staticIndexMeta(index)
    const status = selected.has(index) ? await getChaseStatus(index) : null
    const futs = futuresChain(slices, index, now)
    const selection = chaseFuturesSelection(futs, now)
    const optionDates = optionExpiryDates(slices, index, now)
    indexes.push({
      ...meta,
      chaseEnabled: selected.has(index),
      chaseStatus: status?.status ?? null,
      chaseTradingsymbol: status?.tradingsymbol ?? null,
      chaseStoploss: status?.stoploss ?? null,
      chaseEntryPoint: status?.entryPoint ?? null,
      frontFut: selection.front,
      nextFut: selection.next,
      chaseEmaContracts: selection.emaContracts,
      chaseNewEntry: selection.newEntry,
      optionCurrentExpiry: optionDates[0] ?? null,
      optionNextExpiry: optionDates[1] ?? null,
      optionMonthlyExpiry: monthlyOptionExpiry(optionDates, now),
    })
  }

  return {
    fetchedAt: dayjs(now).toISOString(),
    source,
    cacheNote: CACHE_NOTE,
    kiteError,
    chase: {
      lots: chase.lots,
      paused: chase.paused,
      instruments: chase.instruments,
      emaPeriod: chase.emaPeriod,
      bufferPercent: chase.bufferPercent,
      entryLimitOffset: chase.entryLimitOffset,
    },
    indexes,
  }
}
