import type { SimResult } from "./types"

export function formatSimReport(result: SimResult): string {
  const lines: string[] = []
  lines.push(`scenario=${result.scenario} seed=${result.seed}`)
  lines.push(
    `window=${result.start} → ${result.end} ticks=${result.ticks} elapsedMs=${result.elapsedMs}`
  )
  lines.push(
    `market path=${result.marketConditions.pricePath} vol=${result.marketConditions.volatility} liq=${result.marketConditions.liquidity}`
  )
  lines.push(
    `signals=${result.signals.length} orders=${result.orders.length} fills=${result.fills.length}`
  )
  lines.push(
    `portfolio netQty=${result.portfolio.netQty} realized=${result.portfolio.realizedPnl.toFixed(2)} unrealized=${result.portfolio.unrealizedPnl.toFixed(2)} fees=${result.portfolio.fees.toFixed(2)} exposure=${result.portfolio.exposure.toFixed(2)}`
  )
  for (const p of result.positions) {
    lines.push(
      `  position ${p.symbol} qty=${p.quantity} avg=${p.averagePrice} rpnl=${p.realizedPnl.toFixed(2)}`
    )
  }
  for (const e of result.riskEvents) {
    lines.push(`  risk ${e.code}: ${e.message}`)
  }
  for (const e of result.errors) lines.push(`  error ${e}`)
  for (const w of result.warnings) lines.push(`  warn ${w}`)
  for (const v of result.invariantViolations) lines.push(`  INVARIANT ${v}`)
  for (const a of result.assertionResults) {
    lines.push(`  assert ${a.ok ? "PASS" : "FAIL"} ${a.assertion.type} ${a.message}`)
  }
  return lines.join("\n")
}

export function simFailed(result: SimResult): boolean {
  return result.invariantViolations.length > 0 || result.assertionResults.some(a => !a.ok)
}
