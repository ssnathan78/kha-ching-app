# Environment variables

Copy `.env.example` to `.env` and fill in real values. Never commit `.env`.

Removed (no longer used): Oracle, Supabase, SignalX subscription/mirror keys, `ORCL_HOST_URL`, `SIGNALX_API_KEY`, `AIRTABLE_*`.

Required:

- `DATABASE_URL`
- `REDIS_URL`
- `KITE_API_KEY` / `KITE_API_SECRET`
- `SECRET_COOKIE_PASSWORD` (32+ characters)

Optional: Grafana OTEL endpoint/headers, `MOCK_ORDERS=true` for development.
