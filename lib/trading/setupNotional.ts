import { desc, eq } from "drizzle-orm"

import { getChaseSettings } from "../chaseSettings"
import { nowDayjs } from "../clock"
import { INSTRUMENT_DETAILS, type INSTRUMENTS } from "../constants"
import { db } from "../drizzle"
import { getChaseStatus, getLatestEma } from "../drizzleDbUtils"
import { ema, tradePlans } from "../schema"
import {
  chaseFuturesNotionalInr,
  formatInr,
  lotSizeForInstrument,
  notionalVsCap,
  optionStructureNotionalInr,
} from "./notional"
import { getRiskSettings } from "./riskSettings"

export type SetupNotionalRow = {
  source: "CHASE" | "PLAN"
  label: string
  strategy: string
  instrument: string
  lots: number
  lotSize: number
  qty: number
  legs: number
  price: number | null
  priceNote: string
  notional: number | null
  maxNotionalInr: number
  overCap: boolean
  detail: string
}

export type DeskSetupNotional = {
  maxNotionalInr: number
  rows: SetupNotionalRow[]
}

async function lastCloseForIndex(index: string): Promise<{ price: number; symbol: string } | null> {
  const status = await getChaseStatus(index)
  if (status?.tradingsymbol) {
    const row = await getLatestEma(status.tradingsymbol)
    if (row?.lastClose) {
      return { price: Number(row.lastClose), symbol: status.tradingsymbol }
    }
  }
  const prefix = index.toUpperCase()
  const recent = await db
    .select({ tradingsymbol: ema.tradingsymbol, lastClose: ema.lastClose })
    .from(ema)
    .orderBy(desc(ema.createdAt))
    .limit(80)
  const match = recent.find(
    r => r.tradingsymbol?.startsWith(prefix) && r.tradingsymbol.includes("FUT") && r.lastClose
  )
  if (match?.lastClose && match.tradingsymbol) {
    return { price: Number(match.lastClose), symbol: match.tradingsymbol }
  }
  return null
}

function weekdayKey(): "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | null {
  const name = nowDayjs().format("dddd").toUpperCase()
  if (
    name === "MONDAY" ||
    name === "TUESDAY" ||
    name === "WEDNESDAY" ||
    name === "THURSDAY" ||
    name === "FRIDAY"
  ) {
    return name
  }
  return null
}

export async function buildDeskSetupNotional(): Promise<DeskSetupNotional> {
  const risk = await getRiskSettings()
  const maxNotionalInr = risk.maxNotionalInr
  const rows: SetupNotionalRow[] = []

  const chase = await getChaseSettings()
  for (const index of chase.instruments) {
    const lotSize =
      lotSizeForInstrument(index) || INSTRUMENT_DETAILS[index as INSTRUMENTS]?.lotSize || 0
    const quote = await lastCloseForIndex(index)
    const price = quote?.price ?? null
    const qty = chase.lots * lotSize
    const notional = price ? chaseFuturesNotionalInr({ lots: chase.lots, lotSize, price }) : null
    const cap = notionalVsCap(notional ?? 0, maxNotionalInr, qty)
    rows.push({
      source: "CHASE",
      label: `Chase ${index}`,
      strategy: "CHASE",
      instrument: index,
      lots: chase.lots,
      lotSize,
      qty,
      legs: 1,
      price,
      priceNote: quote
        ? `last hourly close ${quote.symbol}`
        : "no EMA close yet — notional uses LTP at punch",
      notional,
      maxNotionalInr,
      overCap: Boolean(notional && cap.overCap),
      detail: notional
        ? `${chase.lots} lot × ${lotSize} × ₹${formatInr(price || 0)} = ₹${formatInr(notional)}`
        : `${chase.lots} lot × ${lotSize} = ${qty} qty (need a futures price for rupee notional)`,
    })
  }

  const day = weekdayKey()
  if (day) {
    const plans = await db
      .select()
      .from(tradePlans)
      .where(eq(tradePlans.dayOfWeek, day as any))
    for (const plan of plans) {
      if (plan.strategy === "CHASE") continue
      const lotSize = lotSizeForInstrument(plan.instrument)
      const qty = plan.lots * lotSize
      const legs = 2
      rows.push({
        source: "PLAN",
        label: `${day} ${plan.strategy.replaceAll("_", " ")} ${plan.instrument}`,
        strategy: plan.strategy,
        instrument: plan.instrument,
        lots: plan.lots,
        lotSize,
        qty,
        legs,
        price: null,
        priceNote: "option premium is known at punch, not at plan save",
        notional: null,
        maxNotionalInr,
        overCap: false,
        detail: `${plan.lots} lot × ${lotSize} × ${legs} legs = ${qty * legs} qty. Notional = that × premium. Desk cap ₹${formatInr(maxNotionalInr)}.`,
      })
    }
  }

  return { maxNotionalInr, rows }
}

export function previewOptionNotional(input: {
  lots: number
  instruments: string[]
  premium: number
  maxNotionalInr: number
  legs?: number
}): SetupNotionalRow[] {
  const legs = input.legs ?? 2
  return input.instruments.map(instrument => {
    const lotSize = lotSizeForInstrument(instrument)
    const qty = input.lots * lotSize
    const notional = input.premium
      ? optionStructureNotionalInr({ lots: input.lots, lotSize, premium: input.premium, legs })
      : null
    const cap = notionalVsCap(notional ?? 0, input.maxNotionalInr, qty * legs)
    return {
      source: "PLAN" as const,
      label: instrument,
      strategy: "OPTIONS",
      instrument,
      lots: input.lots,
      lotSize,
      qty,
      legs,
      price: input.premium || null,
      priceNote: input.premium ? "estimated premium per lot per leg" : "enter an estimated premium",
      notional,
      maxNotionalInr: input.maxNotionalInr,
      overCap: Boolean(notional && cap.overCap),
      detail: notional
        ? `${input.lots} × ${lotSize} × ${legs} × ₹${formatInr(input.premium)} = ₹${formatInr(notional)}`
        : `${input.lots} × ${lotSize} × ${legs} legs — add premium to compare with ₹${formatInr(input.maxNotionalInr)} cap`,
    }
  })
}
