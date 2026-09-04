# Kha-Ching database notes

Postgres tables (see `lib/schema.ts` and `docs/ARCHITECTURE.md`):

- `trade_plans` — saved weekday strategies
- `job_executions` — scheduled/live jobs (kept for audit; not deleted by cleanup)
- `transactions` — copy of COMPLETE Kite orders (`order_id` unique)
- `accesstoken` — today's Kite access token (plaintext; prune previous days)
- `ema` / `chase_status` / `chase_log` — Subscribe & Chase
