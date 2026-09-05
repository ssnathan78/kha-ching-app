-- One weekday template per strategy. Keep the newest row when duplicates exist.
DELETE FROM trade_plans a
USING trade_plans b
WHERE a.strategy = b.strategy
  AND a.day_of_week IS NOT DISTINCT FROM b.day_of_week
  AND a.updated_at < b.updated_at;

DELETE FROM trade_plans a
USING trade_plans b
WHERE a.strategy = b.strategy
  AND a.day_of_week IS NOT DISTINCT FROM b.day_of_week
  AND a.id < b.id;

CREATE UNIQUE INDEX IF NOT EXISTS trade_plans_day_strategy_uidx
  ON trade_plans (day_of_week, strategy);

CREATE TABLE IF NOT EXISTS strategy_defaults (
  strategy job_execution_strategy PRIMARY KEY,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO strategy_defaults (strategy, config) VALUES
  ('ATM_STRADDLE', '{"name":"ATM Straddle"}'::jsonb),
  ('ATM_STRANGLE', '{"name":"ATM Strangle"}'::jsonb),
  ('SUBSCRIBE_CHASE', '{"name":"Chase","lots":1,"emaPeriod":40,"bufferPercent":0.2,"entryLimitOffset":5}'::jsonb)
ON CONFLICT (strategy) DO NOTHING;
