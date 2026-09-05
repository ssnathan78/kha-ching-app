-- Idempotent copy of legacy EOD `transactions` into the ledger.
-- Does not invent missing decisions, fees, or exit reasons.
-- Positions are rebuilt later by applying unapplied fills (lib/trading).

INSERT INTO orders (
  account_id, job_id, strategy, order_tag, purpose, side, order_type, product,
  exchange, tradingsymbol, instrument_token, validity, requested_qty, filled_qty,
  remaining_qty, average_fill_price, status, broker_order_id, idempotency_key,
  broker_status, provenance, submitted_at, accepted_at, filled_at, metadata
)
SELECT
  'default',
  je.id,
  je.strategy::text,
  t.tag,
  'OTHER',
  t.transaction_type,
  t.order_type,
  t.product,
  COALESCE(t.exchange, 'NFO'),
  COALESCE(t.tradingsymbol, ''),
  t.instrument_token,
  'DAY',
  t.quantity,
  t.quantity,
  0,
  t.average_price,
  'FILLED',
  t.order_id,
  'migrated:' || t.order_id,
  'COMPLETE',
  'MIGRATED',
  COALESCE(t.order_timestamp, t.created_at, now()),
  COALESCE(t.order_timestamp, t.created_at, now()),
  COALESCE(t.order_timestamp, t.created_at, now()),
  jsonb_build_object('source', 'transactions', 'reconstruction', 'partial')
FROM transactions t
LEFT JOIN LATERAL (
  SELECT id, strategy FROM job_executions WHERE order_tag = t.tag ORDER BY created_at DESC LIMIT 1
) je ON true
WHERE t.order_id IS NOT NULL
  AND COALESCE(t.tradingsymbol, '') <> ''
  AND COALESCE(t.quantity, 0) > 0
  AND t.transaction_type IN ('BUY', 'SELL')
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO fills (
  account_id, order_id, job_id, strategy, broker_order_id, exchange, tradingsymbol,
  instrument_token, product, side, quantity, price, fingerprint, occurred_at,
  broker_time, provenance
)
SELECT
  o.account_id,
  o.id,
  o.job_id,
  o.strategy,
  o.broker_order_id,
  o.exchange,
  o.tradingsymbol,
  o.instrument_token,
  o.product,
  o.side,
  o.filled_qty,
  COALESCE(o.average_fill_price, 0),
  'migrated-txn:' || o.broker_order_id,
  COALESCE(o.filled_at, o.created_at),
  o.filled_at,
  'MIGRATED'
FROM orders o
WHERE o.provenance = 'MIGRATED'
  AND o.broker_order_id IS NOT NULL
ON CONFLICT (fingerprint) DO NOTHING;
