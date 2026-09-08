import { RISK_STRATEGY_KEYS, type RiskStrategyKey } from "./trading/riskEngine"

export type FlattenScope =
  | { kind: "all" }
  | { kind: "intraday" }
  | { kind: "strategy"; strategy: string }
  | { kind: "job"; jobId: string }
  | { kind: "position"; positionId: string }

export function parseFlattenScope(
  body: Record<string, unknown> | null | undefined
): { ok: true; scope: FlattenScope } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return {
      ok: false,
      error: "Specify exactly one of positionId, jobId, strategy, all, or intraday",
    }
  }
  const picks: FlattenScope[] = []
  if (body.all === true) picks.push({ kind: "all" })
  if (body.intraday === true || body.scope === "intraday") picks.push({ kind: "intraday" })
  if (typeof body.strategy === "string" && body.strategy.trim()) {
    const strategy = body.strategy.trim().toUpperCase()
    if (!RISK_STRATEGY_KEYS.includes(strategy as RiskStrategyKey)) {
      return { ok: false, error: "strategy must be ATM_STRADDLE, ATM_STRANGLE, or CHASE" }
    }
    picks.push({ kind: "strategy", strategy })
  }
  if (typeof body.jobId === "string" && body.jobId.trim()) {
    picks.push({ kind: "job", jobId: body.jobId.trim() })
  }
  if (typeof body.positionId === "string" && body.positionId.trim()) {
    picks.push({ kind: "position", positionId: body.positionId.trim() })
  }
  if (picks.length !== 1) {
    return {
      ok: false,
      error: "Specify exactly one of positionId, jobId, strategy, all, or intraday",
    }
  }
  return { ok: true, scope: picks[0] }
}
