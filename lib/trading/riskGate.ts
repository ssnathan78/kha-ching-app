import { and, eq, gte, inArray, sql } from "drizzle-orm"
import { now } from "../clock"
import { USER_OVERRIDE } from "../constants"
import { db } from "../drizzle"
import logger from "../logger"
import { jobExecutions, orders } from "../schema"
import { isMarketOpen, isMockOrder } from "../utils"
import { recordAuditEvent } from "./ledger"
import { computeStrategyRiskBook } from "./portfolio"
import {
  evaluateOrder,
  inferOrderRole,
  type OrderRole,
  type RiskIntent,
  RiskRejectedError,
  type RiskSettings,
} from "./riskEngine"
import { getRiskSettings, haltStrategy } from "./riskSettings"

export async function assertOrderAllowed(input: {
  tradingsymbol?: string
  exchange?: string
  transaction_type?: string
  order_type?: string
  product?: string
  quantity?: number
  price?: number
  trigger_price?: number
  tag?: string
  purpose?: string
  role?: OrderRole
  strategy?: string | null
  lots?: number | null
  ltp?: number | null
  ltpAt?: Date | null
}): Promise<void> {
  if (!input.tradingsymbol || !input.quantity || !input.transaction_type) {
    throw new RiskRejectedError({
      ok: false,
      code: "INVALID_INTENT",
      message: "Incomplete order intent",
    })
  }

  const role = input.role ?? inferOrderRole({ purpose: input.purpose, orderType: input.order_type })
  const intent: RiskIntent = {
    role,
    tradingsymbol: input.tradingsymbol,
    quantity: Number(input.quantity),
    side: input.transaction_type === "SELL" ? "SELL" : "BUY",
    product: input.product,
    orderType: input.order_type,
    tag: input.tag,
    price: input.price,
    triggerPrice: input.trigger_price,
    ltp: input.ltp,
    ltpAt: input.ltpAt,
    strategy: input.strategy,
    lots: input.lots,
  }

  let settings: RiskSettings
  try {
    settings = await getRiskSettings()
  } catch (e) {
    logger.error("[riskGate] settings unavailable", e)
    throw new RiskRejectedError({
      ok: false,
      code: "RISK_UNAVAILABLE",
      message: "Risk engine unavailable — fail closed",
    })
  }

  const nowAt = now()
  const minuteAgo = new Date(nowAt.getTime() - 60_000)

  const [openOrds, recent, dup, jobRows] = await Promise.all([
    db
      .select({ id: orders.id })
      .from(orders)
      .where(
        inArray(orders.status, [
          "PENDING",
          "SUBMITTED",
          "ACCEPTED",
          "PARTIALLY_FILLED",
          "UNKNOWN",
          "CANCEL_REQUESTED",
        ])
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(gte(orders.createdAt, minuteAgo)),
    input.tag
      ? db
          .select({ id: orders.id })
          .from(orders)
          .where(
            and(
              eq(orders.orderTag, input.tag),
              eq(orders.tradingsymbol, input.tradingsymbol),
              eq(orders.side, intent.side),
              eq(orders.requestedQty, intent.quantity),
              inArray(orders.status, [
                "PENDING",
                "SUBMITTED",
                "ACCEPTED",
                "PARTIALLY_FILLED",
                "UNKNOWN",
              ])
            )
          )
          .limit(1)
      : Promise.resolve([]),
    input.tag
      ? db
          .select({
            userOverride: jobExecutions.userOverride,
            lots: jobExecutions.lots,
            strategy: jobExecutions.strategy,
          })
          .from(jobExecutions)
          .where(eq(jobExecutions.orderTag, input.tag))
          .limit(1)
      : Promise.resolve([]),
  ])

  const job = jobRows[0]
  if (intent.lots == null && job?.lots != null) intent.lots = Number(job.lots)
  if (!intent.strategy && job?.strategy) intent.strategy = job.strategy
  if (!intent.strategy && input.tag === "chase") intent.strategy = "SUBSCRIBE_CHASE"

  const book = intent.strategy
    ? await computeStrategyRiskBook(intent.strategy).catch(() => ({
        netPnl: 0,
        drawdownPct: 0,
        openPositionCount: 0,
      }))
    : { netPnl: 0, drawdownPct: 0, openPositionCount: 0 }

  const decision = evaluateOrder(intent, {
    settings,
    now: nowAt,
    isMock: isMockOrder(),
    marketOpen: isMarketOpen(),
    jobAborted: job?.userOverride === USER_OVERRIDE.ABORT,
    openPositionCount: book.openPositionCount,
    openOrderCount: openOrds.length,
    recentOrderCount: Number(recent[0]?.n ?? 0),
    pendingDuplicate: dup.length > 0 && role === "ENTRY",
    dailyLossInr: Number.isFinite(book.netPnl) ? book.netPnl : 0,
    drawdownPct: Number.isFinite(book.drawdownPct) ? book.drawdownPct : 0,
  })

  if (!decision.ok) {
    await recordAuditEvent({
      eventType:
        decision.code === "DESK_HALTED" ||
        decision.code === "DAILY_LOSS" ||
        decision.code === "DRAWDOWN" ||
        decision.code === "STRATEGY_HALTED"
          ? "RISK_LIMIT_TRIGGERED"
          : "RISK_CHECK_FAILED",
      summary: decision.message,
      detail: {
        code: decision.code,
        symbol: intent.tradingsymbol,
        role,
        strategy: intent.strategy,
      },
      idempotencyKey: `risk:${decision.code}:${intent.tag || ""}:${intent.tradingsymbol}:${intent.quantity}:${nowAt.toISOString().slice(0, 16)}`,
    })
    if ((decision.code === "DAILY_LOSS" || decision.code === "DRAWDOWN") && intent.strategy) {
      await haltStrategy(intent.strategy, decision.message, "RISK_ENGINE")
    }
    throw new RiskRejectedError(decision)
  }
}
