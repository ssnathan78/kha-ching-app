# Troubleshooting

## Login: “argument name is invalid”

Kite itself succeeded; saving the session cookie failed. The cookie library rejects names that contain `/`. The cookie is now `khaching-kite-session`. Rebuild/restart the app and click **Continue with Kite** once.

## Chrome: “This page isn’t working” / HTTP 500 on `/api/redirect_url_kite`

That URL is a **browser navigation** after Kite login. If the API returned JSON `null` with status 500, Chrome shows a generic failure instead of a message.

**Current behaviour:** failures **redirect** to `/?loginError=...` with a readable reason.

| Cause | What to do |
|---|---|
| Token already used | Click **Continue with Kite** again. Do not refresh the callback. |
| Token expired | Same; Kite tokens for the handshake are short-lived. |
| Redirect URL mismatch | kite.trade must match exactly, including `http` vs `https` and `127.0.0.1` vs a public IP. |
| Wrong `KITE_API_SECRET` | Must belong to the same app as `KITE_API_KEY`. |
| Secure cookie on HTTP | Set `SESSION_COOKIE_SECURE=false` and `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000`. Restart the app container. |
| Empty 500 in old image | Rebuild: `docker compose up --build`. |

Kite’s **API** is always HTTPS from the server. Using HTTP **locally** is normal and supported.

Inspect: `docker compose logs app` and look for `[redirect_url_kite]`.

## Health check 503

`GET /api/health` probes Postgres (`SELECT 1`) and Redis (`PING`).

- Compose: wait until `postgres` / `redis` are healthy, then restart `app`.
- Host install: is `DATABASE_URL` / `REDIS_URL` reachable from the Node process? `localhost` inside Docker is the **container**, not your PC — compose must use hostnames `postgres` and `redis`.

## 401 on `/api/positions` or `/api/pnl`

You are not logged in, or the cookie was dropped. Log in again. Tokens are treated as stale around **07:35 IST**; re-login after ~07:45.

## Logged in but cookie gone on next click

- `SECRET_COOKIE_PASSWORD` changed between requests.
- `SESSION_COOKIE_SECURE=true` on `http://`.
- Mixing `localhost` and `127.0.0.1`.

## Orders not placing

1. `MOCK_ORDERS` — if `true`, the app **simulates** fills.
2. Market hours and product (MIS vs NRML).
3. Open `/queues` — is the job waiting, failed, or delayed?
4. `docker compose logs app` for Kite or worker errors.

## Duplicate or leftover jobs after a previous day

Login no longer wipes Redis. Discard or fail stale jobs in Bull Board.

## Migration errors

- `relation "transactions" does not exist` on an empty DB: you are missing `0000_init.sql` / an old image. Pull latest and recreate, or `docker compose down -v` **only if you can lose local data**, then `up --build`.
- Unique `order_id` fails: duplicates in `transactions`. Inspect `SELECT order_id, count(*) FROM transactions GROUP BY 1 HAVING count(*) > 1`.

## Yarn: `packageManager` vs Yarn 1.22

This repo **must** use Yarn 1.22.22. Yarn 4 will not install from this lockfile. Docker uses Corepack to pin 1.22.22.

## Port already allocated

Something else is using 3000, 5432, or 6379. `netstat` / change `PORT` in compose, or stop the other service.

## OpenTelemetry noise

If Grafana credentials are in `.env`, the app will try to export traces. Missing/invalid OTEL settings can log errors but should not block login. You can comment OTEL vars for local use.
