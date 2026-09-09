import { sendApiError } from "../../../lib/apiErrors"
import logger from "../../../lib/logger"
import withSession from "../../../lib/session"
import {
  DEFAULT_STRATEGY_LIMITS,
  RISK_STRATEGY_KEYS,
  type RiskSettings,
  type StrategyRiskLimits,
} from "../../../lib/trading/riskEngine"
import {
  getRiskSettings,
  haltDesk,
  resumeDesk,
  saveRiskSettings,
} from "../../../lib/trading/riskSettings"
import { isMockOrder } from "../../../lib/utils"

const DESK_NUMBER_KEYS = [
  "maxQtyPerOrder",
  "maxNotionalInr",
  "maxOpenOrders",
  "maxOrdersPerMinute",
  "stalePriceMaxAgeSec",
  "minLtp",
] as const

function sanitizeStrategyLimits(raw: unknown): RiskSettings["strategies"] | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const input = raw as Record<string, Partial<StrategyRiskLimits>>
  const out = {} as RiskSettings["strategies"]
  for (const key of RISK_STRATEGY_KEYS) {
    const row = input[key]
    if (!row || typeof row !== "object") continue
    out[key] = {
      enabled: typeof row.enabled === "boolean" ? row.enabled : DEFAULT_STRATEGY_LIMITS.enabled,
      halted: typeof row.halted === "boolean" ? row.halted : DEFAULT_STRATEGY_LIMITS.halted,
      haltReason:
        typeof row.haltReason === "string" || row.haltReason === null ? row.haltReason : null,
      executionMode: row.executionMode === "LIVE" ? "LIVE" : "PAPER",
      maxLots: Number.isFinite(Number(row.maxLots))
        ? Number(row.maxLots)
        : DEFAULT_STRATEGY_LIMITS.maxLots,
      maxOpenPositions: Number.isFinite(Number(row.maxOpenPositions))
        ? Number(row.maxOpenPositions)
        : DEFAULT_STRATEGY_LIMITS.maxOpenPositions,
    }
  }
  return Object.keys(out).length ? out : undefined
}

function sanitizePatch(
  body: Partial<RiskSettings> & { strategies?: unknown }
): Partial<RiskSettings> {
  const patch: Partial<RiskSettings> = {}
  if (typeof body.tradingEnabled === "boolean") patch.tradingEnabled = body.tradingEnabled
  if (typeof body.allowLiveOrders === "boolean") patch.allowLiveOrders = body.allowLiveOrders
  if (typeof body.requireMarketHours === "boolean")
    patch.requireMarketHours = body.requireMarketHours
  for (const key of DESK_NUMBER_KEYS) {
    const value = body[key]
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      ;(patch as Record<string, number>)[key] = value
    }
  }
  const strategies = sanitizeStrategyLimits(body.strategies)
  if (strategies) patch.strategies = strategies
  return patch
}

export default withSession(async (req, res) => {
  const user = req.session.user
  if (!user) return res.status(401).end()

  try {
    if (req.method === "GET") {
      const settings = await getRiskSettings()
      try {
        const { buildDeskSetupNotional } = await import("../../../lib/trading/setupNotional")
        return res.json({
          settings,
          mockOrders: isMockOrder(),
          setups: await buildDeskSetupNotional(),
        })
      } catch (e) {
        logger.warn("[desk/risk] setup notional unavailable", e)
        return res.json({ settings, mockOrders: isMockOrder() })
      }
    }

    if (req.method === "POST") {
      const action = req.body?.action
      if (action === "halt") {
        const reason =
          typeof req.body?.reason === "string" && req.body.reason.trim()
            ? req.body.reason.trim()
            : "Manual halt from desk"
        return res.json({ settings: await haltDesk(reason, "USER"), mockOrders: isMockOrder() })
      }
      if (action === "resume") {
        return res.json({ settings: await resumeDesk("USER"), mockOrders: isMockOrder() })
      }
      return res.status(400).json({ error: "action must be halt or resume" })
    }

    if (req.method === "PUT") {
      const current = await getRiskSettings()
      const patch = sanitizePatch(req.body?.settings || req.body || {})
      const { getOpenPositions } = await import("../../../lib/trading/ledger")
      const { splitLedgerQty, executionModeSwitchBlocked } = await import(
        "../../../lib/trading/bookSplit"
      )
      const { prepareStrategyGoLive } = await import("../../../lib/trading/goLive")
      const openRows = await getOpenPositions()
      const goingLive: Array<(typeof RISK_STRATEGY_KEYS)[number]> = []
      const token = user.session?.access_token as string | undefined

      for (const key of RISK_STRATEGY_KEYS) {
        const nextMode = patch.strategies?.[key]?.executionMode
        if (!nextMode || nextMode === current.strategies[key].executionMode) continue
        const { paperLedgerQty, liveLedgerQty } = splitLedgerQty(openRows, { strategy: key })
        let kiteQty = 0
        const touchingLive = nextMode === "LIVE" || current.strategies[key].executionMode === "LIVE"
        if (touchingLive && !isMockOrder()) {
          if (!token) {
            return res.status(409).json({
              error:
                "Log in to Kite so we can prove the live book is empty before changing execution mode.",
            })
          }
          try {
            const { getKiteInstance, getNetPositionQty } = await import("../../../lib/kiteUtils")
            const kite = getKiteInstance(token)
            const symbols = new Set(
              openRows
                .filter(r => r.strategy === key && r.tradingsymbol)
                .map(r => r.tradingsymbol as string)
            )
            if (key === "CHASE") {
              const { getChaseStatus } = await import("../../../lib/drizzleDbUtils")
              const chase = await getChaseStatus("NIFTY")
              if (chase?.tradingsymbol) symbols.add(chase.tradingsymbol)
            }
            for (const symbol of symbols) {
              const q = await getNetPositionQty(kite, symbol, { ledgerFallback: false })
              if (q !== 0) kiteQty = q
            }
          } catch (e) {
            logger.warn("[desk/risk] kite qty unavailable on mode switch", e)
            return res.status(409).json({
              error: "Kite positions unavailable — not changing execution mode.",
            })
          }
        }
        const blocked = executionModeSwitchBlocked({
          processMock: isMockOrder(),
          strategy: key,
          fromMode: current.strategies[key].executionMode,
          toMode: nextMode,
          paperLedgerQty,
          liveLedgerQty,
          kiteQty,
        })
        if (!blocked.ok) return res.status(409).json({ error: blocked.error })
        if (current.strategies[key].executionMode !== "LIVE" && nextMode === "LIVE") {
          goingLive.push(key)
        }
      }

      for (const key of goingLive) {
        const prepared = await prepareStrategyGoLive({ strategy: key, actor: "USER" })
        if (!prepared.ok) return res.status(409).json({ error: prepared.error })
      }

      return res.json({ settings: await saveRiskSettings(patch), mockOrders: isMockOrder() })
    }

    return res.status(405).json({ error: "Method not allowed" })
  } catch (e) {
    return sendApiError(res, e, logger, "desk/risk")
  }
})
