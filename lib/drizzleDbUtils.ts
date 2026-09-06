import { and, desc, eq, sql } from "drizzle-orm"
import { db } from "./drizzle"
import { istOnDate, istToday } from "./drizzleIst"
import logger from "./logger"
import { accesstoken, chaseLog, chaseStatus, ema, jobExecutions, transactions } from "./schema"

export interface TransactionData {
  order_timestamp?: Date
  exchange?: string
  tradingsymbol?: string
  instrument_token?: number
  transaction_type?: string
  quantity?: number
  average_price?: number
  tag?: string
  order_id?: string
  variety?: string
  order_type?: string
  product?: string
}

export type EmaRow = typeof ema.$inferSelect

export type ChaseStatusRow = typeof chaseStatus.$inferSelect

export async function storeAccessToken(access_token: string): Promise<void> {
  try {
    await db.execute(sql`SELECT cleanup_old_records()`)
    await db.insert(accesstoken).values({ accessToken: access_token })
  } catch (error) {
    logger.error("[storeAccessToken] error:", error)
  }
}

export async function getLatestAccessToken(): Promise<string | null> {
  try {
    const [row] = await db
      .select({ accessToken: accesstoken.accessToken })
      .from(accesstoken)
      .where(istToday(accesstoken.createdAt))
      .orderBy(desc(accesstoken.createdAt))
      .limit(1)
    return row?.accessToken ?? null
  } catch (error) {
    logger.error("[getLatestAccessToken] error:", error)
    return null
  }
}

export async function clearTodaysAccessTokens(): Promise<void> {
  try {
    await db.delete(accesstoken).where(istToday(accesstoken.createdAt))
  } catch (error) {
    logger.error("[clearTodaysAccessTokens] error:", error)
  }
}

export async function checksameToken(access_token: string): Promise<boolean> {
  try {
    const latestToken = await getLatestAccessToken()
    if (!latestToken) {
      return false
    }
    return latestToken === access_token
  } catch (error) {
    logger.error("[checksameToken] error:", error)
    return false
  }
}

export async function insertMultipleTransactions(
  transactionsData: TransactionData[]
): Promise<{ inserted: number; failed: number; skipped: number }> {
  if (transactionsData.length === 0) {
    return { inserted: 0, failed: 0, skipped: 0 }
  }

  try {
    const values = transactionsData.map(t => ({
      orderTimestamp: t.order_timestamp,
      exchange: t.exchange,
      tradingsymbol: t.tradingsymbol,
      instrumentToken: t.instrument_token,
      transactionType: t.transaction_type,
      quantity: t.quantity,
      averagePrice: t.average_price != null ? String(t.average_price) : undefined,
      tag: t.tag,
      orderId: t.order_id,
      variety: t.variety,
      orderType: t.order_type,
      product: t.product,
    }))

    const result = await db
      .insert(transactions)
      .values(values)
      .onConflictDoNothing({ target: transactions.orderId })
      .returning({ id: transactions.id })

    const inserted = result.length
    const skipped = transactionsData.length - inserted
    logger.info(
      `[insertMultipleTransactions] Inserted ${inserted}, skipped ${skipped} (duplicates)`
    )
    return { inserted, failed: 0, skipped }
  } catch (error) {
    logger.error("[insertMultipleTransactions] Error during batch insert:", error)
    throw error
  }
}

export async function getValuesfromDB(id: string): Promise<Record<string, unknown> | null> {
  const rows = await db.select().from(jobExecutions).where(eq(jobExecutions.id, id))
  return rows[0] ?? null
}

export async function patchDbTrade(
  id: string,
  patchProps: Partial<typeof jobExecutions.$inferInsert>
): Promise<Record<string, unknown>> {
  try {
    const updatedRows = await db
      .update(jobExecutions)
      .set(patchProps)
      .where(eq(jobExecutions.id, id))
      .returning()

    if (updatedRows.length === 0) {
      throw new Error(`[patchDbTrade] No record found with id: ${id}`)
    }

    logger.info(`[patchDbTrade] Successfully updated job execution id: ${id}`)
    return updatedRows[0]
  } catch (error) {
    logger.error("[patchDbTrade] Error patching trade record:", error)
    throw error
  }
}

export async function getLatestEma(tradingsymbol: string): Promise<EmaRow | null> {
  const [row] = await db
    .select()
    .from(ema)
    .where(eq(ema.tradingsymbol, tradingsymbol))
    .orderBy(desc(ema.createdAt))
    .limit(1)

  return row ?? null
}

export async function getEmaByDate(tradingsymbol: string, date: Date): Promise<EmaRow | null> {
  const [row] = await db
    .select()
    .from(ema)
    .where(and(eq(ema.tradingsymbol, tradingsymbol), istOnDate(ema.createdAt, date)))
    .orderBy(desc(ema.createdAt))
    .limit(1)

  return row ?? null
}

export async function insertEma(row: {
  createdAt?: Date
  tradingsymbol: string
  ema: number
  instrumentToken: number
  highestHigh: number
  lowestLow: number
  lastClose: number
}): Promise<void> {
  await db.insert(ema).values({
    createdAt: row.createdAt ?? new Date(),
    tradingsymbol: row.tradingsymbol,
    ema: row.ema,
    instrumentToken: row.instrumentToken,
    highestHigh: row.highestHigh,
    lowestLow: row.lowestLow,
    lastClose: row.lastClose,
  })
}

export async function ensureChaseStatus(instrument = "NIFTY"): Promise<ChaseStatusRow> {
  const [existing] = await db
    .select()
    .from(chaseStatus)
    .where(eq(chaseStatus.instrument, instrument))
    .limit(1)
  if (existing) return existing
  const [legacy] = instrument === "NIFTY" ? await db.select().from(chaseStatus).limit(1) : []
  if (legacy && !legacy.instrument) {
    await db.update(chaseStatus).set({ instrument }).where(eq(chaseStatus.id, legacy.id))
    return { ...legacy, instrument }
  }
  const inserted = await db
    .insert(chaseStatus)
    .values({ instrument, status: "AWAITING_SIGNAL" as any })
    .returning()
  return inserted[0]
}

export async function getChaseStatus(instrument = "NIFTY"): Promise<ChaseStatusRow | null> {
  return ensureChaseStatus(instrument)
}

export async function updateChaseStatus(fields: {
  instrument?: string
  status?: string
  tradingsymbol?: string
  stoploss?: number
  createdAt?: Date
  updatedAt?: Date
  entryPoint?: number
  instrumentToken?: number
  isSignalBreachingTolerance?: boolean
}): Promise<{ success: boolean; error?: unknown }> {
  try {
    const instrument = fields.instrument ?? "NIFTY"
    const row = await ensureChaseStatus(instrument)
    await db
      .update(chaseStatus)
      .set({
        ...(fields.status !== undefined && { status: fields.status as any }),
        ...(fields.tradingsymbol !== undefined && { tradingsymbol: fields.tradingsymbol }),
        ...(fields.stoploss !== undefined && { stoploss: fields.stoploss }),
        ...(fields.createdAt !== undefined && { createdAt: fields.createdAt }),
        ...(fields.entryPoint !== undefined && { entryPoint: fields.entryPoint }),
        ...(fields.instrumentToken !== undefined && { instrumentToken: fields.instrumentToken }),
        ...(fields.isSignalBreachingTolerance !== undefined && {
          isSignalBreachingTolerance: fields.isSignalBreachingTolerance,
        }),
        instrument,
        updatedAt: fields.updatedAt ?? new Date(),
      })
      .where(eq(chaseStatus.id, row.id))
    return { success: true }
  } catch (error) {
    logger.error("[updateChaseStatus] error:", error)
    return { success: false, error }
  }
}

export async function getChaseJob(): Promise<{ lots: number | null } | null> {
  const [row] = await db
    .select({ lots: jobExecutions.lots })
    .from(jobExecutions)
    .where(
      and(
        eq(jobExecutions.strategy, "CHASE" as any),
        sql`${jobExecutions.runAt}::date = current_date`
      )
    )
    .limit(1)
  return row ?? null
}

export async function insertChaseLog(row: {
  tradingsymbol: string
  transactionType: string
  averagePrice: number
  createdAt?: Date
}): Promise<void> {
  await db.insert(chaseLog).values({
    tradingsymbol: row.tradingsymbol,
    transactionType: row.transactionType,
    averagePrice: String(row.averagePrice),
    createdAt: row.createdAt ?? new Date(),
  })
}

export default {
  storeAccessToken,
  getLatestAccessToken,
  clearTodaysAccessTokens,
  checksameToken,
  insertMultipleTransactions,
  patchDbTrade,
  getLatestEma,
  getEmaByDate,
  insertEma,
  getChaseStatus,
  updateChaseStatus,
  insertChaseLog,
}
