# Local setup (newbie guide)

This is the path if you are running Kha-Ching on **your PC** with Docker Desktop. You will log in to **real Kite**, see **live prices**, but **not** send live orders (`MOCK_ORDERS=true`). Production can do the same per strategy: Desk → Risk execution **Paper** uses live quotes and writes the ledger, but never calls Kite `placeOrder`.

## 0. Install Docker Desktop

1. Install [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/).
2. Start Docker Desktop and wait until it says it is running.
3. In PowerShell: `docker version` should print a Client and a Server. If Server is missing, Docker is not running.

You do **not** need to install Node or Postgres yourself for this path.

## 1. Get the code

```powershell
cd C:\senthil
git clone https://github.com/ssnathan78/kha-ching-app.git
cd kha-ching-app
```

If you already cloned, `cd` into that folder instead.

## 2. Create `.env` (secrets live only on your machine)

```powershell
copy .env.example .env
```

Open `.env` in an editor. Fill:

| Variable | What to put |
|---|---|
| `KITE_API_KEY` | From [kite.trade](https://kite.trade) → your app |
| `KITE_API_SECRET` | Same page |
| `SECRET_COOKIE_PASSWORD` | Any random string **≥ 32 characters**. This encrypts the login cookie. If you change it later, everyone is logged out. |
| `MOCK_ORDERS` | `true` for local testing |
| `SESSION_COOKIE_SECURE` | `false` for `http://127.0.0.1` |
| `NEXT_PUBLIC_APP_URL` | `http://127.0.0.1:3000` |
| `TZ` | `Asia/Kolkata` |

Leave `DATABASE_URL` / `REDIS_URL` as in the example (`localhost`). **Compose overwrites them inside the app container** to `postgres` and `redis` hostnames. If `.env` still uses `db` or `postgres` as the host, `yarn migrate` on Windows rewrites those to `localhost`. Jest does the same via `__tests__/loadEnv.js`.

Never commit `.env`. It is gitignored.

## 3. Kite redirect URL (this trips everyone)

Zerodha allows **one** redirect URL per API app.

| Where you open the browser | Redirect URL to paste on kite.trade |
|---|---|
| Same PC as Docker | `http://127.0.0.1:3000/api/redirect_url_kite` |
| Linux server with HTTPS | `https://YOUR_DOMAIN_OR_IP/api/redirect_url_kite` |

Kite redirects **your browser**. If the URL is the Droplet but you logged in from your laptop, the laptop will try to open the Droplet address and local Docker will never see the `request_token`.

**Recommended:** create a **second** Kite Connect app named something like “Kha-Ching local” and point only that app at `127.0.0.1`. Keep production keys on the server.

Use `127.0.0.1`, not `localhost`, in the redirect URL (some browsers treat cookies differently).

## 4. Start the stack

From the repo root:

```powershell
docker compose up --build
```

First build downloads Node images and runs `yarn install` + `yarn build`. That can take several minutes. Later builds are faster.

Compose starts three containers:

| Container | Port on your PC | Role |
|---|---|---|
| `kha-ching-postgres` | 5432 | Database |
| `kha-ching-redis` | 6379 | BullMQ / cache |
| `kha-ching-app` | 3000 | Website + workers |

On **first start**, the app entrypoint runs `yarn migrate`:

1. `drizzle/0000_init.sql` — creates enums and tables
2. `drizzle/0000_integrity.sql` — unique `order_id`, indexes, `cleanup_old_records()`

You can confirm tables:

```powershell
docker compose exec postgres psql -U postgres -d trading_db -c "\dt"
```

You should see `trade_plans`, `job_executions`, `transactions`, `accesstoken`, `ema`, `chase_status`, `chase_log`.

Redis:

```powershell
docker compose exec redis redis-cli ping
```

Should print `PONG`.

## 5. Check the app

1. Open [http://127.0.0.1:3000/api/health](http://127.0.0.1:3000/api/health). You want `"status":"ok"` and both checks `"ok"`.
2. Open [http://127.0.0.1:3000](http://127.0.0.1:3000) and click **Continue with Kite**.
3. After Zerodha, you should land on `/dashboard`.
4. New ledger screens are on [http://127.0.0.1:3000/desk](http://127.0.0.1:3000/desk): Positions, Orders, Trades (history), Activity, and Risk (live-order / lot caps). Weekday templates stay on `/plan`. Chase settings stay on `/chase`.

### Login failed / Chrome “HTTP ERROR 500”

Older builds returned JSON `null` on a failed Kite exchange, which Chrome displays as a broken page. Current code **redirects home** with `?loginError=...`.

Common causes:

- **Reused request_token** — the callback URL is valid **once**. Click Continue with Kite again; do not refresh the callback.
- **Wrong redirect URL** on kite.trade (HTTPS vs HTTP, localhost vs 127.0.0.1, extra path).
- **Wrong API secret** in `.env` vs the app whose key you used.
- **Secure cookie on HTTP** — compose sets `SESSION_COOKIE_SECURE=false`. If you override it to `true`, the browser will not store the session on `http://`.

The app talks to Kite’s **HTTPS** API from inside Docker even when you use HTTP locally. The “HTTP problem” is only the **browser cookie** and the **redirect URL**, not Kite’s API protocol.

## 6. Useful commands

```powershell
docker compose ps                  # are services healthy?
docker compose logs -f app         # app logs
docker compose down                # stop (keeps database volume)
docker compose down -v             # stop AND delete Postgres/Redis data
```

Deleting volumes (`-v`) wipes trades and tokens. You will need to log in again.

## 7. Running automated tests (Docker + host)

You do **not** need the full app container to run integration or API tests — only **Postgres** and **Redis**. Run Jest on your PC; point it at the published Docker ports.

### Start dependencies

```powershell
docker compose up -d postgres redis
docker compose exec postgres pg_isready -U postgres -d trading_db
docker compose exec redis redis-cli ping
```

### Run tests (from repo root, Node ≥ 22.13 installed)

```powershell
yarn install --immutable
yarn migrate
yarn unit-test
yarn int-test
yarn api-test
```

If your `.env` uses internal hostnames like `@db:` or `redis://redis:` (for the app container), host-side tests still work: `__tests__/loadEnv.js` maps those to `localhost:5432` and `127.0.0.1:6379` automatically.

### E2E (Playwright)

Needs a built app and something listening on port **3000**:

1. **Easiest:** keep `docker compose up` running (app container healthy), then on the host:

   ```powershell
   yarn build
   yarn playwright install chromium
   yarn e2e-test
   ```

2. **Or** run `yarn start` on the host after `yarn build`, with postgres/redis still in Docker.

Full options (Playwright-in-Docker, CI checklist, troubleshooting `ENOTFOUND db`): [TESTING_STRATEGY.md](./TESTING_STRATEGY.md#running-tests-with-docker).

### Verify the production image (optional)

```powershell
docker compose build app
```

The image builder runs `yarn unit-test` and `yarn build` inside Docker — useful when you are not running Node locally.

## 8. Optional: app-dev profile

`docker compose --profile dev up --build` builds the **dev** image and bind-mounts source. Port 3000 conflicts with `app`. Use one or the other.

## Why compose sets NODE_ENV=production locally

The default image is a **production Next.js build**. `NODE_ENV=development` would make Next try to compile like `next dev` and fail inside that image. Cookies still work on HTTP because `SESSION_COOKIE_SECURE=false`.
