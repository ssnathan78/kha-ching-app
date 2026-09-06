# Production architecture

What this repository **specifies**. What is actually running on the Droplet is unknown until a read-only SSH audit (see [PRODUCTION_HEALTH.md](./PRODUCTION_HEALTH.md)).

This is a **single DigitalOcean Droplet**, not Kubernetes and not DigitalOcean App Platform ([ADR 0004](./adr/0004-droplet-deployment.md)). Workers must run in the same Node process as `server.js`. Do not deploy with `next start` alone.

## Intended path

```
Internet
   ↓
DNS A record (hostname not in this repo)
   ↓
DigitalOcean Cloud Firewall  (22, 80, 443 only — recommended)
   ↓
Droplet
   ├── sshd          :22
   ├── Caddy or nginx  :80/:443 → TLS → 127.0.0.1:3000
   └── kha-ching
         server.js (Express + Next.js Pages Router + Bull Board /queues)
            ├── Postgres 16     (must not be public)
            ├── Redis 7         (must not be public)
            ├── BullMQ workers  (started when lib/session.ts loads)
            └── Zerodha Kite Connect
```

The repo does **not** contain a Droplet IP, domain, nginx/Caddy config, or cloud-firewall export. Those live on the server and in DigitalOcean.

## As observed (read-only audit 2026-09-05)

This Droplet is **Docker + nginx**, not the systemd `/opt` path.

```
Internet
   ↓
:80 nginx → 301 HTTPS
:443 nginx (self-signed cert, server_name = Droplet IPv4)
   ↓
127.0.0.1:3000  and  0.0.0.0:3000 (Compose publish)
   ↓
kha-ching-app   (image app-app, NODE_ENV=production, MOCK_ORDERS=true)
   ├── kha-ching-db      postgres:16-alpine   (5432 not on host)
   └── kha-ching-redis   redis:7-alpine       (6379 not on host)
```

| Fact | Value |
|---|---|
| Host | Ubuntu 24.04, `ssnathan-blr1-1`, 1 vCPU, 1 GB RAM |
| App tree | `/srv/khaching/app` |
| Running git | `bd4f472` (2026-08-13) |
| Workers | In the app container (same process as documented) |
| Domain | None — HTTPS on the IPv4 address |

Details and findings: [PRODUCTION_HEALTH.md](./PRODUCTION_HEALTH.md).

## Application (from the repo)

| Item | Repository fact |
|---|---|
| Framework | Next.js 16 Pages Router + Express (`server.js`) |
| UI | React 19, MUI 9 |
| Runtime in CI/Docker | **Node 22** |
| Package manager | **Yarn Berry 4.9.1** (`packageManager`, `.yarn/releases/`, `yarn install --immutable`) |
| Build | `yarn build` |
| Start | `yarn start` → `node --require ./otel.js server.js` |
| Bind | `PORT` default 3000, `BIND_HOST` default `0.0.0.0` |
| Timezone | `TZ=Asia/Kolkata` |
| Session | iron-session cookie `khaching-kite-session` |
| Auth | Kite OAuth; production requires `ALLOWED_KITE_USER_ID` |
| Health | `GET /api/health` (Postgres + Redis ping). Optional `HEALTH_CHECK_TOKEN` |
| Queues | BullMQ: trading, exit, auto square-off, ancillary, target PnL, Chase |
| Workers | In-process (side-import from `lib/session.ts`) |
| Broker | Zerodha Kite (`lib/kiteUtils.ts`) |
| Risk | Desk → Risk in Postgres (`lib/trading/riskEngine.ts`) |
| Observability | Winston + optional OpenTelemetry → Grafana Cloud |
| CI | `.github/workflows/ci.yml` on GitHub-hosted Ubuntu — lint, unit, sim, migrate, int, api, build, audit, e2e. **CI does not deploy.** Public repo: Actions minutes are free on standard runners. |

The current repo, CI, and Docker image use **Node 22** and **Yarn Berry 4.9.1**. Deploy paths (Docker rebuild on the Droplet, **laptop image → `docker load`**, systemd) are in [DEPLOYMENT.md](./DEPLOYMENT.md).

## Two documented install styles

The repo describes both. **Do not assume which one the Droplet uses.**

### A. systemd, no Docker

- App dir: `/opt/kha-ching-app`
- Unit: `deploy/kha-ching.service` → `yarn start`, `EnvironmentFile=.../.env`
- Host packages: Node, Yarn, PostgreSQL 16, Redis 7
- Logs: `journalctl -u kha-ching`
- Reverse proxy on the host (Caddy or nginx) — **no config file is in git**

### B. Docker Compose on the Droplet

- `Dockerfile` production stage: Node 22, entrypoint `yarn migrate` then `yarn start`
- Compose services: `app`, `postgres`, `redis`
- **Default compose publishes 5432 and 6379 to the host.** That is for local development. On a public Droplet those ports must not be reachable from the internet.
- Default compose also sets `MOCK_ORDERS=true` and `SESSION_COOKIE_SECURE=false`. Production HTTPS + live trading must override those in the server `.env` / compose override — not by editing this file casually.

`.do/` App Platform templates are **not** for production.

## Data and jobs

- Postgres via Drizzle (`lib/schema.ts`). Migrations in `drizzle/` (`yarn migrate`).
- Redis for BullMQ. Queue names are `*Queue_${KITE_API_KEY}` — **do not log queue names**.
- Daily cleanup `cleanup_old_records()` runs when a new access token is stored (not a separate cron in the app).
- Optional DB dump cron: `scripts/backup-db.sh` (example in DEPLOYMENT.md). Whether cron is installed on the Droplet is unknown.

## External services

- Zerodha Kite Connect (login, LTP, orders when live)
- Optional Slack webhook
- Optional Grafana Cloud OTLP

## What is not in the repository

- Droplet IP / hostname
- SSH users
- nginx / Caddy site files
- DigitalOcean firewall rules
- Let’s Encrypt / certbot state
- Production `.env`
- Whether live orders are enabled

Fill those only in [PRODUCTION_HEALTH.md](./PRODUCTION_HEALTH.md) after a read-only audit. Never commit them if they are secrets.
