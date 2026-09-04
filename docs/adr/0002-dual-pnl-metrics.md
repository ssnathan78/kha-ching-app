# ADR 0002: Dual P&L metrics

## Status

Accepted

## Context

Target square-off used per-unit “points”. Rupee P&L needs quantity × price. Changing points to qty-weighted would change when max profit/loss fires.

## Decision

Keep points for `targetPnL`. Expose rupee P&L (and points) on `/api/pnl` and the dashboard.

## Consequences

Multi-lot rupee P&L scales; point targets do not scale with lots by design.
