import { and, desc, eq, gte, lte, or, type SQL } from "drizzle-orm"

import { db, pool } from "../drizzle"
import {
  auditEvents,
  dailySessions,
  orders,
  portfolioSnapshots,
  positions,
  reconciliationEvents,
  trades,
  tradingDecisions,
} from "../schema"
import { marketValue, unrealizedPnl } from "./accounting"
import { type Money, moneyAdd, moneyFromUnknown, moneyToString, moneyZero } from "./money"
import { DEFAULT_ACCOUNT_ID, provenanceInBook, type TradeBookFilter } from "./types"

export function istSessionDate(at = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at)
}

export type PortfolioView = {
  sessionDate: string
  availableCash: string | null
  usedMargin: string | null
  buyingPower: string | null
  realizedPnl: string
  unrealizedPnl: string
  netPnl: string
  fees: string
  grossExposure: string
  netExposure: string
  portfolioValue: string
  peakEquity: string | null
  drawdown: string | null
  drawdownPct: number | null
  openPositionCount: number
  strategyPnl: { strategy: string; realized: string; unrealized: string }[]
}

export async function computePortfolio(marks?: Map<string, string>): Promise<PortfolioView> {
  const open = await db.select().from(positions)
  let realized = moneyZero()
  let unrealized = moneyZero()
  let fees = moneyZero()
  let grossExposure = moneyZero()
  let netExposure = moneyZero()
  let openCount = 0
  const byStrategy = new Map<string, { realized: Money; unrealized: Money }>()

  for (const pos of open) {
    realized = moneyAdd(realized, moneyFromUnknown(pos.realizedPnl))
    fees = moneyAdd(fees, moneyFromUnknown(pos.fees))
    const mark =
      marks?.get(`${pos.exchange}:${pos.tradingsymbol}`) ??
      pos.markPrice ??
      pos.averageEntryPrice ??
      "0"
    const u = unrealizedPnl(
      pos.quantity,
      moneyFromUnknown(pos.averageEntryPrice),
      moneyFromUnknown(mark)
    )
    unrealized = moneyAdd(unrealized, u)
    const mv = marketValue(pos.quantity, moneyFromUnknown(mark))
    netExposure = moneyAdd(netExposure, mv)
    const absMv = marketValue(Math.abs(pos.quantity), moneyFromUnknown(mark))
    grossExposure = moneyAdd(grossExposure, absMv)
    if (pos.quantity !== 0) openCount += 1
    const key = pos.strategy || "UNATTRIBUTED"
    const bucket = byStrategy.get(key) ?? { realized: moneyZero(), unrealized: moneyZero() }
    bucket.realized = moneyAdd(bucket.realized, moneyFromUnknown(pos.realizedPnl))
    bucket.unrealized = moneyAdd(bucket.unrealized, u)
    byStrategy.set(key, bucket)
  }

  const latestSnap = (
    await db
      .select()
      .from(portfolioSnapshots)
      .where(eq(portfolioSnapshots.accountId, DEFAULT_ACCOUNT_ID))
      .orderBy(desc(portfolioSnapshots.capturedAt))
      .limit(1)
  )[0]

  const cash = moneyFromUnknown(latestSnap?.availableCash)
  const portfolioValue = moneyAdd(cash, unrealized)
  const previousPeak = moneyFromUnknown(latestSnap?.peakEquity)
  const peak = previousPeak > portfolioValue ? previousPeak : portfolioValue
  const drawdown = peak - portfolioValue
  const drawdownPct = peak === 0n ? 0 : Number(drawdown) / Number(peak)

  return {
    sessionDate: istSessionDate(),
    availableCash: latestSnap?.availableCash ?? null,
    usedMargin: latestSnap?.usedMargin ?? null,
    buyingPower: latestSnap?.availableCash ?? null,
    realizedPnl: moneyToString(realized),
    unrealizedPnl: moneyToString(unrealized),
    netPnl: moneyToString(moneyAdd(realized, unrealized) - fees),
    fees: moneyToString(fees),
    grossExposure: moneyToString(grossExposure),
    netExposure: moneyToString(netExposure),
    portfolioValue: moneyToString(portfolioValue),
    peakEquity: moneyToString(peak),
    drawdown: moneyToString(drawdown),
    drawdownPct,
    openPositionCount: openCount,
    strategyPnl: [...byStrategy.entries()].map(([strategy, v]) => ({
      strategy,
      realized: moneyToString(v.realized),
      unrealized: moneyToString(v.unrealized),
    })),
  }
}

/** P&L and open count for one strategy only — strategies do not share risk books. */
export async function computeStrategyRiskBook(
  strategy: string,
  marks?: Map<string, string>,
  book: TradeBookFilter = "ALL"
): Promise<{ netPnl: number; drawdownPct: number; openPositionCount: number }> {
  const rows = await db.select().from(positions)
  let realized = moneyZero()
  let unrealized = moneyZero()
  let openPositionCount = 0
  for (const pos of rows) {
    if (pos.strategy !== strategy) continue
    if (book !== "ALL" && !provenanceInBook(pos.provenance, book)) continue
    realized = moneyAdd(realized, moneyFromUnknown(pos.realizedPnl))
    const mark =
      marks?.get(`${pos.exchange}:${pos.tradingsymbol}`) ??
      pos.markPrice ??
      pos.averageEntryPrice ??
      "0"
    unrealized = moneyAdd(
      unrealized,
      unrealizedPnl(pos.quantity, moneyFromUnknown(pos.averageEntryPrice), moneyFromUnknown(mark))
    )
    if (pos.quantity !== 0) openPositionCount += 1
  }
  const netPnl = Number(moneyToString(moneyAdd(realized, unrealized)))
  const peak = Math.max(Math.abs(netPnl), 1)
  const drawdownPct = netPnl < 0 ? Math.abs(netPnl) / peak : 0
  return { netPnl, drawdownPct, openPositionCount }
}

export async function snapshotPortfolio(input?: {
  source?: string
  availableCash?: string | number | null
  usedMargin?: string | number | null
  span?: string | number | null
  rawMargins?: Record<string, unknown> | null
  marks?: Map<string, string>
}): Promise<PortfolioView> {
  const view = await computePortfolio(input?.marks)
  const cash = input?.availableCash != null ? String(input.availableCash) : view.availableCash
  await db.insert(portfolioSnapshots).values({
    accountId: DEFAULT_ACCOUNT_ID,
    sessionDate: view.sessionDate,
    source: input?.source ?? "INTERNAL",
    availableCash: cash,
    usedMargin: input?.usedMargin != null ? String(input.usedMargin) : view.usedMargin,
    span: input?.span != null ? String(input.span) : null,
    exposure: view.netExposure,
    grossExposure: view.grossExposure,
    netExposure: view.netExposure,
    realizedPnl: view.realizedPnl,
    unrealizedPnl: view.unrealizedPnl,
    fees: view.fees,
    portfolioValue: view.portfolioValue,
    peakEquity: view.peakEquity,
    drawdown: view.drawdown,
    drawdownPct: view.drawdownPct != null ? String(view.drawdownPct) : null,
    openPositionCount: view.openPositionCount,
    rawMargins: input?.rawMargins ?? null,
  })
  await upsertDailySession(view)
  return { ...view, availableCash: cash }
}

export async function upsertDailySession(view: PortfolioView) {
  const closed = await pool.query(
    `SELECT
       COUNT(*)::int AS trade_count,
       COUNT(*) FILTER (WHERE net_pnl::numeric > 0)::int AS win_count,
       COUNT(*) FILTER (WHERE net_pnl::numeric < 0)::int AS loss_count,
       COALESCE(SUM(net_pnl::numeric), 0) AS net_pnl,
       COALESCE(SUM(gross_pnl::numeric), 0) AS gross_pnl,
       COALESCE(SUM(fees::numeric), 0) AS fees,
       MAX(net_pnl::numeric) AS largest_win,
       MIN(net_pnl::numeric) AS largest_loss,
       AVG(net_pnl::numeric) FILTER (WHERE net_pnl::numeric > 0) AS avg_win,
       AVG(net_pnl::numeric) FILTER (WHERE net_pnl::numeric < 0) AS avg_loss
     FROM trades
     WHERE account_id = $1 AND status = 'CLOSED'
       AND (exit_at AT TIME ZONE 'Asia/Kolkata')::date = $2::date`,
    [DEFAULT_ACCOUNT_ID, view.sessionDate]
  )
  const counts = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM orders WHERE account_id = $1
          AND (created_at AT TIME ZONE 'Asia/Kolkata')::date = $2::date) AS order_count,
       (SELECT COUNT(*)::int FROM fills WHERE account_id = $1
          AND (occurred_at AT TIME ZONE 'Asia/Kolkata')::date = $2::date) AS fill_count`,
    [DEFAULT_ACCOUNT_ID, view.sessionDate]
  )
  const t = closed.rows[0] || {}
  const c = counts.rows[0] || {}
  const winCount = t.win_count ?? 0
  const lossCount = t.loss_count ?? 0
  const tradeCount = t.trade_count ?? 0
  const winRate = tradeCount ? winCount / tradeCount : 0

  await pool.query(
    `INSERT INTO daily_sessions (
       account_id, session_date, starting_equity, ending_equity, peak_equity, max_drawdown,
       realized_pnl, unrealized_pnl, fees, gross_pnl, net_pnl, order_count, fill_count,
       trade_count, win_count, loss_count, largest_win, largest_loss, avg_win, avg_loss,
       win_rate, exposure_peak, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,now()
     )
     ON CONFLICT (account_id, session_date) DO UPDATE SET
       ending_equity = EXCLUDED.ending_equity,
       peak_equity = EXCLUDED.peak_equity,
       max_drawdown = EXCLUDED.max_drawdown,
       realized_pnl = EXCLUDED.realized_pnl,
       unrealized_pnl = EXCLUDED.unrealized_pnl,
       fees = EXCLUDED.fees,
       gross_pnl = EXCLUDED.gross_pnl,
       net_pnl = EXCLUDED.net_pnl,
       order_count = EXCLUDED.order_count,
       fill_count = EXCLUDED.fill_count,
       trade_count = EXCLUDED.trade_count,
       win_count = EXCLUDED.win_count,
       loss_count = EXCLUDED.loss_count,
       largest_win = EXCLUDED.largest_win,
       largest_loss = EXCLUDED.largest_loss,
       avg_win = EXCLUDED.avg_win,
       avg_loss = EXCLUDED.avg_loss,
       win_rate = EXCLUDED.win_rate,
       exposure_peak = EXCLUDED.exposure_peak,
       updated_at = now()`,
    [
      DEFAULT_ACCOUNT_ID,
      view.sessionDate,
      view.portfolioValue,
      view.portfolioValue,
      view.peakEquity,
      view.drawdown,
      view.realizedPnl,
      view.unrealizedPnl,
      String(t.fees ?? view.fees),
      String(t.gross_pnl ?? 0),
      String(t.net_pnl ?? view.netPnl),
      c.order_count ?? 0,
      c.fill_count ?? 0,
      tradeCount,
      winCount,
      lossCount,
      t.largest_win != null ? String(t.largest_win) : null,
      t.largest_loss != null ? String(t.largest_loss) : null,
      t.avg_win != null ? String(t.avg_win) : null,
      t.avg_loss != null ? String(t.avg_loss) : null,
      String(winRate),
      view.grossExposure,
    ]
  )
}

export type { TradeBookFilter }

export type TradeListQuery = {
  limit?: number
  book?: TradeBookFilter
  from?: Date | string | null
  to?: Date | string | null
}

function orderBookClause(book?: TradeBookFilter): SQL | undefined {
  if (book === "PAPER") {
    return or(eq(orders.provenance, "PAPER"), eq(orders.provenance, "MOCK"))
  }
  if (book === "LIVE") {
    return or(
      eq(orders.provenance, "LIVE"),
      eq(orders.provenance, "RECONCILED"),
      eq(orders.provenance, "MIGRATED")
    )
  }
  return undefined
}

function positionBookClause(book?: TradeBookFilter): SQL | undefined {
  if (book === "PAPER") {
    return or(eq(positions.provenance, "PAPER"), eq(positions.provenance, "MOCK"))
  }
  if (book === "LIVE") {
    return or(
      eq(positions.provenance, "LIVE"),
      eq(positions.provenance, "RECONCILED"),
      eq(positions.provenance, "MIGRATED")
    )
  }
  return undefined
}

export async function listOrders(limitOrQuery: number | TradeListQuery = 100) {
  const opts: TradeListQuery =
    typeof limitOrQuery === "number" ? { limit: limitOrQuery } : limitOrQuery
  const limit = opts.limit ?? 200
  const bookClause = orderBookClause(opts.book)
  return db.select().from(orders).where(bookClause).orderBy(desc(orders.createdAt)).limit(limit)
}

export async function listPositions(book: TradeBookFilter = "ALL") {
  const bookClause = positionBookClause(book)
  return db.select().from(positions).where(bookClause).orderBy(desc(positions.updatedAt))
}

function tradeBookClause(book?: TradeBookFilter): SQL | undefined {
  if (book === "PAPER") {
    return or(eq(trades.provenance, "PAPER"), eq(trades.provenance, "MOCK"))
  }
  if (book === "LIVE") {
    return or(
      eq(trades.provenance, "LIVE"),
      eq(trades.provenance, "RECONCILED"),
      eq(trades.provenance, "MIGRATED")
    )
  }
  return undefined
}

export async function listTrades(query: number | TradeListQuery = 100) {
  const opts: TradeListQuery = typeof query === "number" ? { limit: query } : query
  const limit = opts.limit ?? 200
  const clauses: SQL[] = []
  const bookClause = tradeBookClause(opts.book)
  if (bookClause) clauses.push(bookClause)
  if (opts.from) clauses.push(gte(trades.entryAt, new Date(opts.from)))
  if (opts.to) clauses.push(lte(trades.entryAt, new Date(opts.to)))
  const where = clauses.length ? and(...clauses) : undefined
  return db.select().from(trades).where(where).orderBy(desc(trades.entryAt)).limit(limit)
}

export async function listDecisions(limit = 100) {
  return db.select().from(tradingDecisions).orderBy(desc(tradingDecisions.occurredAt)).limit(limit)
}

export async function listAudit(limit = 150) {
  return db.select().from(auditEvents).orderBy(desc(auditEvents.occurredAt)).limit(limit)
}

export async function listRecon(limit = 50) {
  return db
    .select()
    .from(reconciliationEvents)
    .orderBy(desc(reconciliationEvents.occurredAt))
    .limit(limit)
}

export async function listDailySessions(limit = 30) {
  return db.select().from(dailySessions).orderBy(desc(dailySessions.sessionDate)).limit(limit)
}

export async function markPositions(marks: Map<string, string>) {
  const open = await db.select().from(positions).where(eq(positions.status, "OPEN"))
  for (const pos of open) {
    const mark = marks.get(`${pos.exchange}:${pos.tradingsymbol}`)
    if (mark == null) continue
    const u = unrealizedPnl(
      pos.quantity,
      moneyFromUnknown(pos.averageEntryPrice),
      moneyFromUnknown(mark)
    )
    const mv = marketValue(pos.quantity, moneyFromUnknown(mark))
    await db
      .update(positions)
      .set({
        markPrice: mark,
        unrealizedPnl: moneyToString(u),
        marketValue: moneyToString(mv),
        updatedAt: new Date(),
      })
      .where(eq(positions.id, pos.id))
  }
}
