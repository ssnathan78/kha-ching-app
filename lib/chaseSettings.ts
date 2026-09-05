import { eq } from "drizzle-orm"

import { CHASE_MASTER_DEFAULTS, type ChaseEngineConfig } from "./chaseDefaults"
import { normalizeChaseInstruments, validateChaseSettings } from "./chaseValidation"
import { db } from "./drizzle"
import { chaseSettings } from "./schema"

export { CHASE_MASTER_DEFAULTS } from "./chaseDefaults"
export type { ChaseEngineConfig }

let cache: { at: number; value: ChaseEngineConfig } | null = null
const CACHE_MS = 5_000

function toConfig(row: {
  lots: number
  emaPeriod: number
  bufferPercent: string | number
  entryLimitOffset: string | number
  paused: boolean
  instruments?: unknown
}): ChaseEngineConfig {
  return {
    lots: Number(row.lots) || CHASE_MASTER_DEFAULTS.lots,
    emaPeriod: Number(row.emaPeriod) || CHASE_MASTER_DEFAULTS.emaPeriod,
    bufferPercent: Number(row.bufferPercent),
    entryLimitOffset: Number(row.entryLimitOffset),
    paused: Boolean(row.paused),
    instruments: normalizeChaseInstruments(row.instruments ?? CHASE_MASTER_DEFAULTS.instruments),
  }
}

export async function getChaseSettings(): Promise<ChaseEngineConfig> {
  const now = Date.now()
  if (cache && now - cache.at < CACHE_MS) {
    return cache.value
  }

  const [row] = await db.select().from(chaseSettings).where(eq(chaseSettings.id, 1)).limit(1)
  const value = row ? toConfig(row) : { ...CHASE_MASTER_DEFAULTS }
  cache = { at: now, value }
  return value
}

export async function saveChaseSettings(
  patch: Partial<ChaseEngineConfig>
): Promise<ChaseEngineConfig> {
  const validation = validateChaseSettings(patch)
  if (!validation.ok) {
    throw new Error(validation.error)
  }

  const current = await getChaseSettings()
  const next: ChaseEngineConfig = {
    lots: Math.max(1, Number(patch.lots ?? current.lots) || 1),
    emaPeriod: Math.max(1, Math.min(500, Number(patch.emaPeriod ?? current.emaPeriod) || 40)),
    bufferPercent:
      patch.bufferPercent == null
        ? current.bufferPercent
        : Math.min(10, Math.max(0, Number(patch.bufferPercent))),
    entryLimitOffset:
      patch.entryLimitOffset == null
        ? current.entryLimitOffset
        : Math.min(100, Math.max(0, Number(patch.entryLimitOffset))),
    paused: patch.paused == null ? current.paused : Boolean(patch.paused),
    instruments: normalizeChaseInstruments(patch.instruments ?? current.instruments),
  }

  await db
    .insert(chaseSettings)
    .values({
      id: 1,
      lots: next.lots,
      emaPeriod: next.emaPeriod,
      bufferPercent: String(next.bufferPercent),
      entryLimitOffset: String(next.entryLimitOffset),
      paused: next.paused,
      instruments: next.instruments,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: chaseSettings.id,
      set: {
        lots: next.lots,
        emaPeriod: next.emaPeriod,
        bufferPercent: String(next.bufferPercent),
        entryLimitOffset: String(next.entryLimitOffset),
        paused: next.paused,
        instruments: next.instruments,
        updatedAt: new Date(),
      },
    })

  cache = { at: Date.now(), value: next }
  if (current.paused !== next.paused) {
    const { recordAuditEvent } = await import("./trading/ledger")
    await recordAuditEvent({
      eventType: next.paused ? "STRATEGY_PAUSED" : "STRATEGY_RESUMED",
      actor: "USER",
      summary: next.paused ? "Chase paused" : "Chase resumed",
      idempotencyKey: `chase-pause:${next.paused}:${Date.now()}`,
    })
  }
  return next
}

export async function getChaseEngineConfig(): Promise<ChaseEngineConfig> {
  return getChaseSettings()
}
