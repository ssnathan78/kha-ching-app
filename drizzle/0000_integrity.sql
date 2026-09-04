-- Deduplicate completed-order copies, then enforce uniqueness and useful indexes.
-- Rollback: DROP INDEX IF EXISTS transactions_order_id_uidx;

DELETE FROM transactions a
USING transactions b
WHERE a.id > b.id
  AND a.order_id IS NOT NULL
  AND a.order_id = b.order_id;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_order_id_uidx ON transactions (order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_tag ON transactions (tag);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at);
CREATE INDEX IF NOT EXISTS idx_job_executions_created_at ON job_executions (created_at);
CREATE INDEX IF NOT EXISTS idx_job_executions_order_tag ON job_executions (order_tag);

-- Keep access tokens current-day only. Do not delete job_executions (audit trail).
CREATE OR REPLACE FUNCTION cleanup_old_records()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM accesstoken WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date < (NOW() AT TIME ZONE 'Asia/Kolkata')::date;
  DELETE FROM ema WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$;
