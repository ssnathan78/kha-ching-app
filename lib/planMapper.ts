export const PLAN_STRATEGY_NAMES: Record<string, string> = {
  ATM_STRADDLE: "ATM Straddle",
  ATM_STRANGLE: "ATM Strangle",
}

const DB_PLAN_COLUMNS = new Set([
  "name",
  "strategy",
  "instrument",
  "expiryType",
  "productType",
  "dayOfWeek",
  "exitStrategy",
  "combinedExitStrategy",
  "runAt",
  "squareOffTime",
  "expiresAt",
  "expireIfUnsuccessfulInMins",
  "lots",
  "slmPercent",
  "slOrderType",
  "slLimitPricePercent",
  "maxProfitPoints",
  "isMaxProfitEnabled",
  "trailingProfitPercent",
  "maxLossPoints",
  "isMaxLossEnabled",
  "thresholdSkewPercent",
  "maxSkewPercent",
  "takeTradeIrrespectiveSkew",
  "volatilityType",
  "trailEveryPercentageChangeValue",
  "trailingSlPercent",
  "trailingMaxProfitPoints",
  "trailingMaxLossPoints",
  "isAutoSquareOffEnabled",
  "autoSquareOffTime",
])

const TIMESTAMP_COLUMNS = new Set(["runAt", "squareOffTime", "expiresAt", "autoSquareOffTime"])

const EXTRA_PLAN_KEYS = [
  "inverted",
  "entryStrategy",
  "distanceFromAtm",
  "percentfromAtm",
  "optionPrice",
  "orderType",
  "isHedgeEnabled",
  "hedgeDistance",
] as const

export function collectPlanExtras(planConfig: Record<string, any> = {}): Record<string, unknown> {
  const extras: Record<string, unknown> = {
    ...((planConfig.extras && typeof planConfig.extras === "object"
      ? planConfig.extras
      : {}) as Record<string, unknown>),
  }
  for (const key of EXTRA_PLAN_KEYS) {
    const value = planConfig[key]
    if (value === undefined || value === null) continue
    if (typeof value === "number" && !Number.isFinite(value)) continue
    extras[key] = value
  }
  return extras
}

export function coercePlanName(name: unknown, strategy?: string): string {
  const trimmed = String(name ?? "").trim()
  if (trimmed) return trimmed
  return PLAN_STRATEGY_NAMES[strategy ?? ""] || "Plan"
}

export function coerceLots(lots: unknown): number {
  const n = Number(lots)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.floor(n)
}

const toDate = (value: unknown) => {
  if (!value) return value
  if (value instanceof Date) return value
  const d = new Date(value as string)
  return Number.isNaN(d.getTime()) ? value : d
}

export function mapPlanToDb(planConfig: Record<string, any> = {}, dayOfWeek?: string) {
  const normalizedPlan = {
    ...planConfig,
    dayOfWeek: dayOfWeek || planConfig.dayOfWeek || planConfig.day_of_week,
    autoSquareOffTime: planConfig.autoSquareOffProps?.time || planConfig.autoSquareOffTime,
  }

  const mapped = Object.entries(normalizedPlan).reduce<Record<string, unknown>>(
    (accum, [key, value]) => {
      if (value === undefined || value === null || key === "id" || key === "collection") {
        return accum
      }
      if (typeof value === "number" && !Number.isFinite(value)) {
        return accum
      }
      if (DB_PLAN_COLUMNS.has(key)) {
        accum[key] = TIMESTAMP_COLUMNS.has(key) ? toDate(value) : value
      }
      return accum
    },
    {}
  )

  mapped.name = coercePlanName(mapped.name, String(mapped.strategy || planConfig.strategy || ""))
  mapped.lots = coerceLots(mapped.lots ?? planConfig.lots)
  mapped.extras = collectPlanExtras(planConfig)

  return mapped
}

export function mapPlanFromDb(row: Record<string, any>) {
  const extras = row.extras && typeof row.extras === "object" ? row.extras : {}
  const normalizedRow = Object.fromEntries(
    Object.entries(row).filter(
      ([key, value]) =>
        value != null && key !== "createdAt" && key !== "updatedAt" && key !== "extras"
    )
  )

  return {
    ...extras,
    ...normalizedRow,
    autoSquareOffProps: row.autoSquareOffTime
      ? { time: row.autoSquareOffTime, deletePendingOrders: true }
      : undefined,
  }
}

export function planApiErrorMessage(err: any): string {
  const code = err?.cause?.code || err?.code
  const column = err?.cause?.column
  if (code === "23502") {
    if (column === "name") return "Give the template a name before saving."
    if (column === "lots") return "Lots must be at least 1."
    return `Missing required field (${column || "unknown"}).`
  }
  if (code === "23505") {
    return "This weekday already has a template for that strategy. Edit the existing one."
  }
  return err?.cause?.detail || err?.message || "Could not save template"
}
