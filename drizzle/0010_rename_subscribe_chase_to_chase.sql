-- Rename strategy key SUBSCRIBE_CHASE → CHASE.
-- Enum-typed columns (job_executions, trade_plans, strategy_defaults) follow RENAME VALUE.
-- Text/jsonb columns need an explicit rewrite.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'job_execution_strategy'
      AND e.enumlabel = 'SUBSCRIBE_CHASE'
  ) THEN
    ALTER TYPE job_execution_strategy RENAME VALUE 'SUBSCRIBE_CHASE' TO 'CHASE';
  END IF;
END $$;

UPDATE strategy_signals SET strategy = 'CHASE' WHERE strategy = 'SUBSCRIBE_CHASE';
UPDATE trading_decisions SET strategy = 'CHASE' WHERE strategy = 'SUBSCRIBE_CHASE';
UPDATE orders SET strategy = 'CHASE' WHERE strategy = 'SUBSCRIBE_CHASE';
UPDATE positions SET strategy = 'CHASE' WHERE strategy = 'SUBSCRIBE_CHASE';
UPDATE trades SET strategy = 'CHASE' WHERE strategy = 'SUBSCRIBE_CHASE';

UPDATE risk_settings
SET strategy_limits = (strategy_limits - 'SUBSCRIBE_CHASE')
  || jsonb_build_object('CHASE', COALESCE(strategy_limits->'SUBSCRIBE_CHASE', '{}'::jsonb))
WHERE strategy_limits ? 'SUBSCRIBE_CHASE';

UPDATE risk_settings
SET disabled_strategies = replace(disabled_strategies::text, 'SUBSCRIBE_CHASE', 'CHASE')::jsonb
WHERE disabled_strategies::text LIKE '%SUBSCRIBE_CHASE%';
