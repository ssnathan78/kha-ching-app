# Kha-Ching

Kha-Ching is a **personal** app for placing and managing Indian index-options trades through **Zerodha Kite Connect**. You run it yourself (laptop Docker or a Linux server). It is not a hosted product and it does not share data with anyone else.

If you have never used this repo: start with **Docker on your PC** (`docs/LOCAL.md`). You do not need to install Node, Postgres, or Redis on Windows if Docker Desktop is running.

## What it does

- **ATM straddle / strangle** — sell (or buy, depending on your form) Nifty / BankNifty / FinNifty options around the at-the-money strike, with stop-loss and a time-based square-off.
- **Chase** — a Nifty futures 40-EMA chase strategy.
- **Trade plans** — save weekday templates so jobs can be scheduled without retyping every field.
- **Queues** — orders are not placed inside the HTTP request. They go to **BullMQ** (Redis). You can inspect jobs at `/queues` after you log in.
- **Two P&amp;L numbers** — rupee P&amp;L (`quantity × price`) in the UI, and **strategy points** used for max-profit / max-loss square-off. Those two numbers are supposed to be different; do not “fix” points to rupees.

## What you need before the first run

1. A [Zerodha](https://zerodha.com/) account and a [Kite Connect](https://developers.kite.trade/) app (API key + secret).
2. **Docker Desktop** (Windows) **or** Node 20 + Yarn 1.22 + Postgres 16 + Redis 7.
3. Timezone **Asia/Kolkata** (compose sets `TZ` for you).
4. `MOCK_ORDERS=true` until you are ready to send **real** orders.

Kite allows **one redirect URL per API app**. Local Docker must use:

`http://127.0.0.1:3000/api/redirect_url_kite`

A production server uses `https://YOUR_HOST/api/redirect_url_kite`. Best practice: **two Kite apps** (dev + prod) so you do not keep swapping the URL.

## Quick start (Docker — recommended)

```bash
git clone https://github.com/ssnathan78/kha-ching-app.git
cd kha-ching-app
copy .env.example .env
```

Edit `.env`: paste your Kite key/secret and a `SECRET_COOKIE_PASSWORD` of **at least 32 characters**. Leave `MOCK_ORDERS=true`.

```bash
docker compose up --build
```

Wait until the `app` container is **healthy**. Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

- Health (no login): [http://127.0.0.1:3000/api/health](http://127.0.0.1:3000/api/health) must show `"postgres":"ok"` and `"redis":"ok"`.
- Click **Continue with Kite**. After Zerodha login you should land on `/dashboard`.
- Request tokens are **one-time**. If login fails, click Continue with Kite again (do not refresh the callback URL).

Compose starts **Postgres**, **Redis**, and the **app**. On first boot the app runs SQL in `drizzle/` (creates tables, then integrity indexes). You should not need a separate “init DB” command.

## Documentation map

| Document | Read it when… |
|---|---|
| [docs/strategies/README.md](docs/strategies/README.md) | What ATM straddle, strangle, and Chase actually do (formulas, state, exits) |
| [docs/LOCAL.md](docs/LOCAL.md) | First laptop run, Kite redirect, HTTP cookies, mock orders |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Running without Docker, Yarn, tests, migrations |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How UI, queues, DB, and Kite fit together |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Putting this on a VPS / Droplet with HTTPS |
| [docs/SSH.md](docs/SSH.md) | Laptop SSH, Windows ssh-agent, any coding agent → Droplet |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Login 500, health 503, orders not firing |
| [DOCKER.md](DOCKER.md) | Compose commands only |
| [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md) | Notes for coding agents working in this repo |

## Stack (short)

Next.js 16 **Pages Router**, custom **Express** server (`server.js`), React 18, MUI 5, TypeScript + leftover JS, **Postgres 16** (Drizzle), **Redis 7** (BullMQ), Kite Connect SDK.

Package manager: **Yarn Classic 1.22** (the lockfile is Yarn v1). Do not enable Yarn 4 on this repo.

## License

MIT — [LICENSE.md](LICENSE.md).
