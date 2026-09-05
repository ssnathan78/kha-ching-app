import { eq } from "drizzle-orm"

import { db } from "../drizzle"
import logger from "../logger"
import { riskSettings } from "../schema"
import { recordAuditEvent } from "./ledger"
import {
  DEFAULT_RISK_SETTINGS,
  DEFAULT_STRATEGY_LIMITS,
  defaultStrategyLimits,
  limitsFor,
  RISK_STRATEGY_KEYS,
  type RiskSettings,
  type RiskStrategyKey,
  type StrategyRiskLimits,
} from "./riskEngine"

function mergeStrategyLimits(raw: unknown): Record<RiskStrategyKey, StrategyRiskLimits> {
  const parsed =
    raw && typeof raw === "object" ? (raw as Record<string, Partial<StrategyRiskLimits>>) : {}
  const out = defaultStrategyLimits()
  for (const key of RISK_STRATEGY_KEYS) {
    const row = parsed[key]
    if (!row || typeof row !== "object") continue
    out[key] = {
      enabled: row.enabled ?? DEFAULT_STRATEGY_LIMITS.enabled,
      halted: row.halted ?? DEFAULT_STRATEGY_LIMITS.halted,
      haltReason: row.haltReason ?? null,
      maxLots: Number.isFinite(Number(row.maxLots))
        ? Number(row.maxLots)
        : DEFAULT_STRATEGY_LIMITS.maxLots,
      maxDailyLossInr: Number.isFinite(Number(row.maxDailyLossInr))
        ? Number(row.maxDailyLossInr)
        : DEFAULT_STRATEGY_LIMITS.maxDailyLossInr,
      maxDrawdownPct: Number.isFinite(Number(row.maxDrawdownPct))
        ? Number(row.maxDrawdownPct)
        : DEFAULT_STRATEGY_LIMITS.maxDrawdownPct,
      maxOpenPositions: Number.isFinite(Number(row.maxOpenPositions))
        ? Number(row.maxOpenPositions)
        : DEFAULT_STRATEGY_LIMITS.maxOpenPositions,
    }
  }
  return out
}

function rowToSettings(row: typeof riskSettings.$inferSelect | undefined): RiskSettings {
  if (!row) return { ...DEFAULT_RISK_SETTINGS, strategies: defaultStrategyLimits() }
  return {
    tradingEnabled: row.tradingEnabled,
    deskHalted: row.deskHalted,
    haltReason: row.haltReason,
    allowLiveOrders: row.allowLiveOrders,
    maxQtyPerOrder: row.maxQtyPerOrder,
    maxNotionalInr: Number(row.maxNotionalInr),
    maxOpenOrders: row.maxOpenOrders,
    maxOrdersPerMinute: row.maxOrdersPerMinute,
    stalePriceMaxAgeSec: row.stalePriceMaxAgeSec,
    requireMarketHours: row.requireMarketHours,
    minLtp: Number(row.minLtp),
    strategies: mergeStrategyLimits(row.strategyLimits),
  }
}

export async function getMaxLotsForStrategy(strategy?: string | null): Promise<number> {
  const settings = await getRiskSettings()
  return limitsFor(settings, strategy).maxLots
}

export async function getRiskSettings(): Promise<RiskSettings> {
  try {
    const rows = await db.select().from(riskSettings).where(eq(riskSettings.id, 1)).limit(1)
    return rowToSettings(rows[0])
  } catch (e) {
    logger.error("[riskSettings.get]", e)
    return {
      ...DEFAULT_RISK_SETTINGS,
      tradingEnabled: false,
      deskHalted: true,
      haltReason: "risk settings unavailable",
      strategies: defaultStrategyLimits(),
    }
  }
}

export async function saveRiskSettings(patch: Partial<RiskSettings>): Promise<RiskSettings> {
  const current = await getRiskSettings()
  const next: RiskSettings = {
    ...current,
    ...patch,
    strategies: patch.strategies
      ? mergeStrategyLimits({ ...current.strategies, ...patch.strategies })
      : current.strategies,
  }
  await db
    .insert(riskSettings)
    .values({
      id: 1,
      tradingEnabled: next.tradingEnabled,
      deskHalted: next.deskHalted,
      haltReason: next.haltReason,
      allowLiveOrders: next.allowLiveOrders,
      maxLots: next.strategies.ATM_STRADDLE.maxLots,
      maxQtyPerOrder: next.maxQtyPerOrder,
      maxOpenPositions: next.strategies.ATM_STRADDLE.maxOpenPositions,
      maxDailyLossInr: String(next.strategies.ATM_STRADDLE.maxDailyLossInr),
      maxDrawdownPct: String(next.strategies.ATM_STRADDLE.maxDrawdownPct),
      disabledStrategies: RISK_STRATEGY_KEYS.filter(k => !next.strategies[k].enabled),
      maxNotionalInr: String(next.maxNotionalInr),
      maxOpenOrders: next.maxOpenOrders,
      maxOrdersPerMinute: next.maxOrdersPerMinute,
      stalePriceMaxAgeSec: next.stalePriceMaxAgeSec,
      requireMarketHours: next.requireMarketHours,
      minLtp: String(next.minLtp),
      strategyLimits: next.strategies,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: riskSettings.id,
      set: {
        tradingEnabled: next.tradingEnabled,
        deskHalted: next.deskHalted,
        haltReason: next.haltReason,
        allowLiveOrders: next.allowLiveOrders,
        maxLots: next.strategies.ATM_STRADDLE.maxLots,
        maxQtyPerOrder: next.maxQtyPerOrder,
        maxOpenPositions: next.strategies.ATM_STRADDLE.maxOpenPositions,
        maxDailyLossInr: String(next.strategies.ATM_STRADDLE.maxDailyLossInr),
        maxDrawdownPct: String(next.strategies.ATM_STRADDLE.maxDrawdownPct),
        disabledStrategies: RISK_STRATEGY_KEYS.filter(k => !next.strategies[k].enabled),
        maxNotionalInr: String(next.maxNotionalInr),
        maxOpenOrders: next.maxOpenOrders,
        maxOrdersPerMinute: next.maxOrdersPerMinute,
        stalePriceMaxAgeSec: next.stalePriceMaxAgeSec,
        requireMarketHours: next.requireMarketHours,
        minLtp: String(next.minLtp),
        strategyLimits: next.strategies,
        updatedAt: new Date(),
      },
    })
  return next
}

export async function haltDesk(reason: string, actor = "SYSTEM") {
  const next = await saveRiskSettings({ deskHalted: true, haltReason: reason })
  await recordAuditEvent({
    eventType: "KILL_SWITCH",
    actor,
    summary: `Desk halted: ${reason}`,
    idempotencyKey: `halt:${reason}:${new Date().toISOString().slice(0, 16)}`,
  })
  return next
}

export async function resumeDesk(actor = "USER") {
  const next = await saveRiskSettings({ deskHalted: false, haltReason: null, tradingEnabled: true })
  await recordAuditEvent({
    eventType: "MANUAL_INTERVENTION",
    actor,
    summary: "Desk resumed after halt",
    idempotencyKey: `resume:${new Date().toISOString()}`,
  })
  return next
}

export async function haltStrategy(strategy: string, reason: string, actor = "RISK_ENGINE") {
  if (!RISK_STRATEGY_KEYS.includes(strategy as RiskStrategyKey)) return getRiskSettings()
  const current = await getRiskSettings()
  const key = strategy as RiskStrategyKey
  const next = await saveRiskSettings({
    strategies: {
      ...current.strategies,
      [key]: { ...current.strategies[key], halted: true, haltReason: reason },
    },
  })
  await recordAuditEvent({
    eventType: "RISK_LIMIT_TRIGGERED",
    actor,
    summary: `${strategy} halted: ${reason}`,
    idempotencyKey: `halt-strat:${strategy}:${new Date().toISOString().slice(0, 16)}`,
  })
  return next
}
