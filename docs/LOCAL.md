# Local Docker testing (mock orders, live Kite)

Kite Connect allows **one redirect URL per app**.

| Environment | Redirect URL to set on [kite.trade](https://kite.trade) |
|---|---|
| Droplet (production) | `https://165.232.183.138/api/redirect_url_kite` |
| This machine (browser on the same PC as Docker) | `http://127.0.0.1:3000/api/redirect_url_kite` |

Kite redirects **your browser**, not the Droplet. After login, the browser must open that URL. Local Docker published on port 3000 is therefore `127.0.0.1:3000`.

Recommended: create a **second Kite Connect app** for development so production can keep the Droplet URL.

## `.env` (required for compose)

Copy `.env.example` to `.env`. Set at least:

- `KITE_API_KEY` / `KITE_API_SECRET` (dev app keys if you created one)
- `SECRET_COOKIE_PASSWORD` (32+ chars)
- `MOCK_ORDERS=true`

Compose **overrides** `DATABASE_URL` and `REDIS_URL` to the `postgres` and `redis` services. You do not need to point those at Docker hostnames in `.env` when using `docker compose up`.

Keep `NODE_ENV=development` (compose already sets this) so session cookies work over HTTP.

## Run

```bash
docker compose up --build
```

Then open http://127.0.0.1:3000, log in with Kite, schedule a trade. Orders are mocked; market data and login are live.

Apply schema if migrate did not: `docker compose exec app yarn drizzle:push`

Health: http://127.0.0.1:3000/api/health
