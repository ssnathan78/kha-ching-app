CREATE OR REPLACE FUNCTION cleanup_old_records()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM accesstoken WHERE (created_at AT TIME ZONE 'Asia/Kolkata')::date < (NOW() AT TIME ZONE 'Asia/Kolkata')::date;
  DELETE FROM ema WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$;
