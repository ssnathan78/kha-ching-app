import { collectPlanExtras } from "./planMapper"
import type { jobExecutions } from "./schema"

/** Columns accepted on job_executions insert (excludes server-controlled fields). */
const JOB_EXECUTION_INSERT_COLUMNS = new Set([
  "name",
  "instrument",
  "strategy",
  "exitStrategy",
  "combinedExitStrategy",
  "expiryType",
  "productType",
  "volatilityType",
  "slOrderType",
  "lots",
  "slmPercent",
  "slLimitPricePercent",
  "maxProfitPoints",
  "maxLossPoints",
  "trailingSlPercent",
  "trailingMaxProfitPoints",
  "trailingMaxLossPoints",
  "trailingProfitPercent",
  "trailEveryPctChangeValue",
  "trailEveryPercentageChangeValue",
  "thresholdSkewPercent",
  "maxSkewPercent",
  "expireIfUnsuccessfulInMins",
  "isMaxProfitEnabled",
  "isMaxLossEnabled",
  "isAutoSquareOffEnabled",
  "takeTradeIrrespectiveSkew",
  "onSquareOffSetAborted",
  "runNow",
  "squareOffTime",
  "expiresAt",
  "runAt",
  "autoSquareOffTime",
  "autoSquareOffProps",
  "autoSquareOffDeletePendingOrders",
  "dayOfWeek",
  "planRef",
])

const TIMESTAMP_COLUMNS = new Set(["squareOffTime", "expiresAt", "runAt", "autoSquareOffTime"])

/** Strangle / hedge fields passed to queue workers but not stored as DB columns. */
const QUEUE_ONLY_FIELDS = [
  "entryStrategy",
  "distanceFromAtm",
  "percentfromAtm",
  "optionPrice",
  "orderType",
  "isHedgeEnabled",
  "hedgeDistance",
  "inverted",
  "onBrokenHedgeOrders",
  "onBrokenPrimaryOrders",
  "onBrokenExitOrders",
] as const

const toDate = (value: unknown) => {
  if (!value) return value
  if (value instanceof Date) return value
  const d = new Date(value as string)
  return Number.isNaN(d.getTime()) ? value : d
}

export function mapJobExecutionInsert(body: Record<string, unknown> = {}): Record<string, unknown> {
  const mapped = Object.entries(body).reduce<Record<string, unknown>>((accum, [key, value]) => {
    if (value === undefined || value === null || key === "id" || key === "orderTag") {
      return accum
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
      return accum
    }
    if (JOB_EXECUTION_INSERT_COLUMNS.has(key)) {
      accum[key] = TIMESTAMP_COLUMNS.has(key) ? toDate(value) : value
    }
    return accum
  }, {})

  return mapped
}

/** Safe payload for BullMQ workers — DB-mapped fields plus strategy extras. */
export function mapJobExecutionQueuePayload(
  body: Record<string, unknown>,
  dbRow: Record<string, unknown>,
  orderTag: string
): Record<string, unknown> {
  const extras = collectPlanExtras(body)
  const queueOnly = Object.fromEntries(
    QUEUE_ONLY_FIELDS.map(key => [key, body[key]]).filter(([, v]) => v !== undefined && v !== null)
  )

  return {
    ...dbRow,
    ...queueOnly,
    ...extras,
    orderTag,
  }
}

export type JobExecutionInsert = typeof jobExecutions.$inferInsert
