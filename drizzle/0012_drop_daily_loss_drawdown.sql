-- Chase / straddle / strangle are not gated on daily P&L or drawdown.
ALTER TABLE risk_settings DROP COLUMN IF EXISTS max_daily_loss_inr;
ALTER TABLE risk_settings DROP COLUMN IF EXISTS max_drawdown_pct;

UPDATE risk_settings
SET strategy_limits = COALESCE(
  (
    SELECT jsonb_object_agg(
      k,
      CASE
        WHEN jsonb_typeof(v) = 'object' THEN v - 'maxDailyLossInr' - 'maxDrawdownPct'
        ELSE v
      END
    )
    FROM jsonb_each(strategy_limits) AS t(k, v)
  ),
  '{}'::jsonb
)
WHERE strategy_limits IS NOT NULL
  AND jsonb_typeof(strategy_limits) = 'object';
