-- Strangle/straddle fields that are not first-class columns (entry strategy, inverted, hedge).
ALTER TABLE trade_plans
  ADD COLUMN IF NOT EXISTS extras jsonb NOT NULL DEFAULT '{}'::jsonb;
