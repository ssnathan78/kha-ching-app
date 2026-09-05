ALTER TABLE risk_settings
  ADD COLUMN IF NOT EXISTS strategy_limits jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE chase_settings
  ADD COLUMN IF NOT EXISTS instruments jsonb NOT NULL DEFAULT '["NIFTY"]'::jsonb;

ALTER TABLE chase_status
  ADD COLUMN IF NOT EXISTS instrument text;

UPDATE chase_status SET instrument = 'NIFTY' WHERE instrument IS NULL;

INSERT INTO chase_status (id, current_status, instrument)
SELECT 1, 'AWAITING_SIGNAL', 'NIFTY'
WHERE NOT EXISTS (SELECT 1 FROM chase_status);

UPDATE chase_settings SET instruments = '["NIFTY"]'::jsonb WHERE instruments IS NULL;
