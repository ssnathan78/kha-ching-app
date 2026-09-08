import { eq } from "drizzle-orm"
import type { KiteUser } from "../types/misc"
import { resetChaseSignalState } from "./chaseReset"
import { INTRADAY_STRATEGIES } from "./constants"
import { db } from "./drizzle"
import type { FlattenScope } from "./flattenScope"
import { abortJobExecution } from "./jobControl"
import {
  cancelOrder,
  getKiteInstance,
  getNetPositionQty,
  placeKiteOrder,
  placeOrder,
  type RiskAwarePlaceOrder,
} from "./kiteUtils"
import logger from "./logger"
import { jobExecutions } from "./schema"
import { chaseInstrumentFromTradingsymbol, flattenRowPlan } from "./trading/bookSplit"
import { getOpenPositions, recordAuditEvent } from "./trading/ledger"
import { isSyntheticProvenance, ledgerProvenance } from "./trading/types"
import { isMockOrder } from "./utils"

export type { FlattenScope } from "./flattenScope"
export { parseFlattenScope } from "./flattenScope"

export type FlattenOpenResult = {
  flattened: Array<{ positionId: string; tradingsymbol: string; qty: number; side: string }>
  skipped: Array<{ positionId?: string; tradingsymbol?: string; reason: string }>
  abortedJobs: string[]
  chaseReset: string[]
}

type OpenRow = Awaited<ReturnType<typeof getOpenPositions>>[number]

function isIntradayStrategy(strategy: string | null | undefined) {
  return INTRADAY_STRATEGIES.includes(strategy as (typeof INTRADAY_STRATEGIES)[number])
}

async function loadJobStrategy(jobId: string): Promise<string | null> {
  const [row] = await db
    .select({ strategy: jobExecutions.strategy })
    .from(jobExecutions)
    .where(eq(jobExecutions.id, jobId))
    .limit(1)
  return row?.strategy ?? null
}

async function selectRows(scope: FlattenScope, open: OpenRow[]): Promise<OpenRow[]> {
  const live = open.filter(row => Number(row.quantity) !== 0 && row.status === "OPEN")
  if (scope.kind === "all") return live
  if (scope.kind === "intraday") return live.filter(row => isIntradayStrategy(row.strategy))
  if (scope.kind === "strategy") return live.filter(row => row.strategy === scope.strategy)
  if (scope.kind === "position") return live.filter(row => row.id === scope.positionId)
  return live.filter(row => row.jobId === scope.jobId)
}

async function cancelPendingSl(tradingsymbol: string, accessToken: string) {
  for (const side of ["BUY", "SELL"] as const) {
    try {
      await cancelOrder(tradingsymbol, side, accessToken)
    } catch (e) {
      logger.warn(`[flattenOpen] cancel pending ${side} skipped for ${tradingsymbol}`, e)
    }
  }
}

function paperFlattenKite() {
  return {
    VARIETY_REGULAR: "regular",
    getLTP: async () => ({}),
  }
}

async function submitFlattenOrder(input: {
  paperBook: boolean
  accessToken: string
  tradingsymbol: string
  exchange: string
  side: "BUY" | "SELL"
  qty: number
  product: string
  strategy: string | null
  ltp?: number
}) {
  const order = {
    tradingsymbol: input.tradingsymbol,
    exchange: input.exchange,
    transaction_type: input.side,
    quantity: input.qty,
    order_type: "MARKET",
    product: input.product,
    tag: input.strategy === "CHASE" ? "chase" : undefined,
    purpose: "SQUARE_OFF",
    strategy: input.strategy ?? undefined,
    ltp: input.ltp,
  }
  if (input.paperBook) {
    const kite = paperFlattenKite()
    return placeOrder(kite as never, "regular", order as RiskAwarePlaceOrder)
  }
  return placeKiteOrder(input.accessToken, order as RiskAwarePlaceOrder)
}

/**
 * Flatten currently open books without halting the desk or pausing Chase.
 * Chase is returned to AWAITING_SIGNAL so the next hourly job can take a fresh signal.
 * Option jobs are aborted after their books are flat so SL / auto square-off do not re-enter.
 */
export async function flattenOpenPositions(input: {
  user: KiteUser
  scope: FlattenScope
  abortOptionJobs?: boolean
}): Promise<FlattenOpenResult> {
  const abortOptionJobs = input.abortOptionJobs !== false
  const accessToken = input.user.session?.access_token
  if (!accessToken) {
    throw new Error("Log in to Kite before squaring off.")
  }

  const processMock = isMockOrder()
  const open = await getOpenPositions()
  const rows = await selectRows(input.scope, open)
  const result: FlattenOpenResult = {
    flattened: [],
    skipped: [],
    abortedJobs: [],
    chaseReset: [],
  }

  if (input.scope.kind === "position" && rows.length === 0) {
    result.skipped.push({ positionId: input.scope.positionId, reason: "already flat" })
    return result
  }

  let kite: ReturnType<typeof getKiteInstance> | null = null
  const liveKite = () => {
    if (!kite) kite = getKiteInstance(accessToken)
    return kite
  }
  const optionJobIds = new Set<string>()
  const chaseInstruments = new Set<string>()

  for (const row of rows) {
    const paperBook = processMock || isSyntheticProvenance(ledgerProvenance(row.provenance))
    let kiteQueried = false
    let kiteQty = 0
    if (!paperBook) {
      try {
        kiteQty = await getNetPositionQty(liveKite(), row.tradingsymbol, { ledgerFallback: false })
        kiteQueried = true
      } catch (e) {
        logger.warn(`[flattenOpen] kite qty unavailable for ${row.tradingsymbol}`, e)
      }
    }
    const plan = flattenRowPlan({
      ledgerQty: Number(row.quantity),
      paperBook,
      kiteQueried,
      kiteQty,
    })
    if (plan.action === "skip") {
      result.skipped.push({
        positionId: row.id,
        tradingsymbol: row.tradingsymbol,
        reason: plan.reason,
      })
      continue
    }

    if (!paperBook) {
      await cancelPendingSl(row.tradingsymbol, accessToken)
    }

    const product = row.product || (row.strategy === "CHASE" ? "NRML" : "MIS")
    const exchange = row.exchange || "NFO"
    try {
      await submitFlattenOrder({
        paperBook,
        accessToken,
        tradingsymbol: row.tradingsymbol,
        exchange,
        side: plan.side,
        qty: plan.qty,
        product,
        strategy: row.strategy,
        ltp: Number(row.averageEntryPrice) || Number(row.markPrice) || 1,
      })
      result.flattened.push({
        positionId: row.id,
        tradingsymbol: row.tradingsymbol,
        qty: plan.qty,
        side: plan.side,
      })
      await recordAuditEvent({
        eventType: "MANUAL_INTERVENTION",
        actor: "USER",
        jobId: row.jobId,
        positionId: row.id,
        summary: `Squared off ${row.tradingsymbol} qty ${plan.qty}`,
        idempotencyKey: `flatten:${row.id}:${Date.now()}`,
      })
    } catch (e) {
      const reason = e instanceof Error ? e.message : "flatten failed"
      logger.error(`[flattenOpen] ${row.tradingsymbol}`, e)
      result.skipped.push({
        positionId: row.id,
        tradingsymbol: row.tradingsymbol,
        reason,
      })
      continue
    }

    if (row.strategy === "CHASE") {
      const instrument = chaseInstrumentFromTradingsymbol(row.tradingsymbol)
      if (instrument) chaseInstruments.add(instrument)
    } else if (row.jobId && isIntradayStrategy(row.strategy)) {
      optionJobIds.add(row.jobId)
    }
  }

  if (input.scope.kind === "strategy" && input.scope.strategy === "CHASE") {
    const { getChaseSettings } = await import("./chaseSettings")
    const chase = await getChaseSettings()
    for (const instrument of chase.instruments?.length ? chase.instruments : ["NIFTY"]) {
      chaseInstruments.add(instrument)
    }
  }

  if (input.scope.kind === "job") {
    const strategy = await loadJobStrategy(input.scope.jobId)
    if (isIntradayStrategy(strategy)) {
      optionJobIds.add(input.scope.jobId)
    }
  }

  const stillOpen = await getOpenPositions()
  const stillOpenByJob = new Set(
    stillOpen.filter(row => Number(row.quantity) !== 0 && row.jobId).map(row => String(row.jobId))
  )
  const stillOpenChase = new Set(
    stillOpen
      .filter(row => row.strategy === "CHASE" && Number(row.quantity) !== 0)
      .map(row => chaseInstrumentFromTradingsymbol(row.tradingsymbol))
      .filter((value): value is string => Boolean(value))
  )

  if (abortOptionJobs) {
    for (const jobId of optionJobIds) {
      if (stillOpenByJob.has(jobId)) continue
      try {
        await abortJobExecution(jobId)
        result.abortedJobs.push(jobId)
      } catch (e) {
        logger.error(`[flattenOpen] abort ${jobId} failed`, e)
      }
    }
  }

  for (const instrument of chaseInstruments) {
    if (stillOpenChase.has(instrument)) continue
    try {
      const reset = await resetChaseSignalState({
        instrument,
        accessToken,
        force: false,
      })
      if (reset.ok) result.chaseReset.push(instrument)
      else {
        logger.warn(`[flattenOpen] Chase reset skipped ${instrument}`, reset.error)
      }
    } catch (e) {
      logger.warn(`[flattenOpen] Chase reset failed ${instrument}`, e)
    }
  }

  return result
}
