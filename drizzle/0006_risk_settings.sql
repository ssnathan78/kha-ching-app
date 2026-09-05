CREATE TABLE IF NOT EXISTS risk_settings (
  id integer PRIMARY KEY,
  trading_enabled boolean NOT NULL DEFAULT true,
  desk_halted boolean NOT NULL DEFAULT false,
  halt_reason text,
  allow_live_orders boolean NOT NULL DEFAULT false,
  max_lots integer NOT NULL DEFAULT 20,
  max_qty_per_order integer NOT NULL DEFAULT 1800,
  max_notional_inr numeric(18, 4) NOT NULL DEFAULT 2000000,
  max_open_positions integer NOT NULL DEFAULT 12,
  max_open_orders integer NOT NULL DEFAULT 40,
  max_daily_loss_inr numeric(18, 4) NOT NULL DEFAULT 50000,
  max_drawdown_pct numeric(18, 6) NOT NULL DEFAULT 0.15,
  max_orders_per_minute integer NOT NULL DEFAULT 20,
  stale_price_max_age_sec integer NOT NULL DEFAULT 30,
  require_market_hours boolean NOT NULL DEFAULT true,
  min_ltp numeric(18, 4) NOT NULL DEFAULT 0.05,
  disabled_strategies jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT risk_settings_id_chk CHECK (id = 1)
);

INSERT INTO risk_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
