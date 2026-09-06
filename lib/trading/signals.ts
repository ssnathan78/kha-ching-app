import { and, desc, eq, gte, isNotNull, lt, type SQL } from "drizzle-orm"

import { now } from "../clock"
import { db } from "../drizzle"
import logger from "../logger"
import { jobExecutions, operatorFeedClears, strategySignals } from "../schema"
import {
  type FeedClear,
  type FeedClearMode,
  type FeedPeriod,
  isHiddenByClears,
  istTodayBounds,
  type OperatorFeed,
  periodBounds,
} from "./feedWindow"

export type SignalKind =
  | "EMA_COMPARE"
  | "SKEW_SAMPLE"
  | "STRIKE_SELECT"
  | "STATE"
  | "SL_UPDATE"
  | "ENTRY"

export type SignalOutcome = "HOLD" | "WAIT" | "ENTER" | "REJECT" | "SKIP" | "ADJUST" | "INVALID"

export type StrategySignal = {
  id: string
  occurredAt: string
  strategy: string | null
  instrument: string | null
  tradingsymbol: string | null
  jobId: string | null
  planRef: string | null
  orderTag: string | null
  jobName: string | null
  kind: string
  outcome: string
  summary: string
  features: Record<string, unknown>
}

export type SignalFilters = {
  strategies: string[]
  planRefs: string[]
  jobs: { id: string; name: string | null; orderTag: string | null }[]
}

async function jobContext(tag?: string | null, jobId?: string | null) {
  if (jobId) {
    const rows = await db
      .select({
        id: jobExecutions.id,
        strategy: jobExecutions.strategy,
        instrument: jobExecutions.instrument,
        planRef: jobExecutions.planRef,
        orderTag: jobExecutions.orderTag,
        name: jobExecutions.name,
      })
      .from(jobExecutions)
      .where(eq(jobExecutions.id, jobId))
      .limit(1)
    return rows[0] ?? null
  }
  if (!tag) return null
  const rows = await db
    .select({
      id: jobExecutions.id,
      strategy: jobExecutions.strategy,
      instrument: jobExecutions.instrument,
      planRef: jobExecutions.planRef,
      orderTag: jobExecutions.orderTag,
      name: jobExecutions.name,
    })
    .from(jobExecutions)
    .where(eq(jobExecutions.orderTag, tag))
    .orderBy(desc(jobExecutions.createdAt))
    .limit(1)
  return rows[0] ?? null
}

export async function recordStrategySignal(input: {
  strategy?: string | null
  instrument?: string | null
  tradingsymbol?: string | null
  jobId?: string | null
  planRef?: string | null
  orderTag?: string | null
  jobName?: string | null
  kind: SignalKind
  outcome: SignalOutcome
  summary: string
  features?: Record<string, unknown>
  idempotencyKey: string
  occurredAt?: Date
}): Promise<void> {
  try {
    const job = await jobContext(input.orderTag, input.jobId)
    await db
      .insert(strategySignals)
      .values({
        occurredAt: input.occurredAt ?? now(),
        strategy: input.strategy ?? job?.strategy ?? null,
        instrument: input.instrument ?? job?.instrument ?? null,
        tradingsymbol: input.tradingsymbol ?? null,
        jobId: input.jobId ?? job?.id ?? null,
        planRef: input.planRef ?? job?.planRef ?? null,
        orderTag: input.orderTag ?? job?.orderTag ?? null,
        jobName: input.jobName ?? job?.name ?? null,
        kind: input.kind,
        outcome: input.outcome,
        summary: input.summary,
        features: input.features ?? {},
        idempotencyKey: input.idempotencyKey,
      })
      .onConflictDoNothing()
  } catch (e) {
    logger.error("[signals.record]", e)
  }
}

export async function listFeedClears(feed: OperatorFeed): Promise<FeedClear[]> {
  const rows = await db
    .select()
    .from(operatorFeedClears)
    .where(eq(operatorFeedClears.feed, feed))
    .orderBy(desc(operatorFeedClears.createdAt))
    .limit(50)
  return rows.map(row => ({
    mode: row.mode as FeedClearMode,
    istDate: row.istDate,
    before: row.before,
  }))
}

export async function recordFeedClear(feed: OperatorFeed, mode: FeedClearMode) {
  const nowAt = now()
  const { start, istDate } = istTodayBounds(nowAt)
  await db.insert(operatorFeedClears).values({
    feed,
    mode,
    istDate: mode === "today" ? istDate : null,
    before: mode === "before_today" ? start : nowAt,
  })
}

export async function deleteSignalsForPeriod(period: FeedPeriod) {
  const { from, to } = periodBounds(period)
  const clauses: SQL[] = []
  if (from) clauses.push(gte(strategySignals.occurredAt, from))
  if (to) clauses.push(lt(strategySignals.occurredAt, to))
  if (clauses.length) {
    await db.delete(strategySignals).where(and(...clauses))
    return
  }
  await db.delete(strategySignals)
}

export async function listStrategySignals(query: {
  period?: FeedPeriod
  strategy?: string | null
  planRef?: string | null
  jobId?: string | null
  orderTag?: string | null
  limit?: number
}): Promise<{ signals: StrategySignal[]; filters: SignalFilters }> {
  const period = query.period ?? "all"
  const { from, to } = periodBounds(period)
  const clauses: SQL[] = []
  if (from) clauses.push(gte(strategySignals.occurredAt, from))
  if (to) clauses.push(lt(strategySignals.occurredAt, to))
  if (query.strategy) clauses.push(eq(strategySignals.strategy, query.strategy))
  if (query.planRef) clauses.push(eq(strategySignals.planRef, query.planRef))
  if (query.jobId) clauses.push(eq(strategySignals.jobId, query.jobId))
  if (query.orderTag) clauses.push(eq(strategySignals.orderTag, query.orderTag))

  const [rows, filterRows, clears] = await Promise.all([
    db
      .select()
      .from(strategySignals)
      .where(clauses.length ? and(...clauses) : undefined)
      .orderBy(desc(strategySignals.occurredAt))
      .limit(query.limit ?? 300),
    db
      .select({
        strategy: strategySignals.strategy,
        planRef: strategySignals.planRef,
        jobId: strategySignals.jobId,
        jobName: strategySignals.jobName,
        orderTag: strategySignals.orderTag,
      })
      .from(strategySignals)
      .where(isNotNull(strategySignals.strategy))
      .limit(500),
    listFeedClears("signals"),
  ])

  const visible = rows.filter(row => !isHiddenByClears(row.occurredAt, clears))
  const strategies = new Set<string>()
  const planRefs = new Set<string>()
  const jobs = new Map<string, { id: string; name: string | null; orderTag: string | null }>()
  for (const row of filterRows) {
    if (row.strategy) strategies.add(row.strategy)
    if (row.planRef) planRefs.add(row.planRef)
    if (row.jobId) {
      jobs.set(row.jobId, { id: row.jobId, name: row.jobName, orderTag: row.orderTag })
    }
  }

  return {
    signals: visible.map(row => ({
      id: row.id,
      occurredAt: row.occurredAt.toISOString(),
      strategy: row.strategy,
      instrument: row.instrument,
      tradingsymbol: row.tradingsymbol,
      jobId: row.jobId,
      planRef: row.planRef,
      orderTag: row.orderTag,
      jobName: row.jobName,
      kind: row.kind,
      outcome: row.outcome,
      summary: row.summary,
      features: (row.features ?? {}) as Record<string, unknown>,
    })),
    filters: {
      strategies: [...strategies].sort(),
      planRefs: [...planRefs].sort(),
      jobs: [...jobs.values()],
    },
  }
}

export { shouldSampleSkewAttempt } from "./feedWindow"
