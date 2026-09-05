-- Single Chase plan (not a weekday template). Pause stops new entries after the open trade is done.
DELETE FROM trade_plans WHERE strategy = 'SUBSCRIBE_CHASE';

CREATE TABLE IF NOT EXISTS chase_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  lots integer NOT NULL DEFAULT 1,
  ema_period integer NOT NULL DEFAULT 40,
  buffer_percent numeric NOT NULL DEFAULT 0.2,
  entry_limit_offset numeric NOT NULL DEFAULT 5,
  paused boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO chase_settings (id, lots, ema_period, buffer_percent, entry_limit_offset, paused)
VALUES (1, 1, 40, 0.2, 5, false)
ON CONFLICT (id) DO NOTHING;
