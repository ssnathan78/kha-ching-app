# Troubleshooting

| Symptom | Check |
|---|---|
| 401 on APIs | Log in with Kite after ~07:45 IST (tokens expire ~07:35) |
| Health 503 | Postgres `DATABASE_URL`, Redis `REDIS_URL` |
| Orders not punching | `MOCK_ORDERS`, market hours, queue `/queues` |
| Duplicate jobs after login | Queues are no longer obliterated on login; discard stale jobs in the worker if scheduled for another day |
| Session lost | `SECRET_COOKIE_PASSWORD` changed; re-login |
| Unique order_id migration fails | Duplicates should be deleted by `0000_integrity.sql`; if not, inspect `SELECT order_id, count(*) FROM transactions GROUP BY 1 HAVING count(*)>1` |
