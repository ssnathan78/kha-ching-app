# Deployment (DigitalOcean Droplet or any Linux VPS)

This guide assumes you have used SSH before, but not that you know this app. Production is **one VM**, not Kubernetes and not DigitalOcean App Platform.

Operations after the box exists: [PRODUCTION_ARCHITECTURE.md](./PRODUCTION_ARCHITECTURE.md), [PRODUCTION_RUNBOOK.md](./PRODUCTION_RUNBOOK.md), [PRODUCTION_SECURITY.md](./PRODUCTION_SECURITY.md), [PRODUCTION_HEALTH.md](./PRODUCTION_HEALTH.md). **SSH / any coding agent:** [SSH.md](./SSH.md). Template: [ssh-config.example](./ssh-config.example). Read-only probe: `scripts/production-health-check.sh`.

Why one VM: BullMQ **workers run in the same Node process** as `server.js`. A platform that only runs `next start` will skip workers and `/queues`.

**Stack in this repo:** Node **22**, Yarn Berry **4.9.1** (`yarn install --immutable`), Postgres **16**, Redis **7**. Docker images use the same versions.

## How this Droplet is installed (2026-09)

| Item | Value |
|---|---|
| Layout | **Docker Compose**, not systemd |
| App tree | `/srv/khaching/app` |
| Containers | `kha-ching-app`, `kha-ching-postgres`, `kha-ching-redis` (older installs used `kha-ching-db`) |
| Image name | `app-app` (Compose project `app` + service `app`, production target) |
| Proxy | Host **nginx** → `127.0.0.1:3000` |
| App port | Bind **localhost only** (`127.0.0.1:3000:3000`) |
| systemd unit | **Not used** (`kha-ching.service` / `/opt/kha-ching-app` are the alternate install) |

**Same `docker-compose.yml` as the laptop.** All published ports bind to `127.0.0.1` (app 3000, Postgres 5432, Redis 6379). That is safe on a public Droplet: the internet cannot hit them; nginx still reaches the app on localhost. What differs is **`.env`** (`NEXT_PUBLIC_APP_URL=https://…`, `SESSION_COOKIE_SECURE=true`, production Kite keys). Compose still forces `DATABASE_URL` / `REDIS_URL` to the Docker hostnames `postgres` and `redis`.

---

## GitHub Actions (CI, not CD)

Workflow: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). Runs: [github.com/ssnathan78/kha-ching-app/actions](https://github.com/ssnathan78/kha-ching-app/actions).

| | |
|---|---|
| When | Push to `master` / `main` / `modernize/**`, and every pull request |
| Where | GitHub-hosted `ubuntu-latest` (not the Droplet, not `kha-ching-dev`) |
| Cost | **Free** while the repo is **public** and the job uses standard GitHub-hosted Linux runners. [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions). Private repos use the plan’s monthly minutes. |
| Deploys? | **No.** Green CI does not update the Droplet. |

Job `verify` (in order): install → `yarn lint` → unit → sim → migrate → int → api → `yarn build` → production npm audit → Playwright Chromium → e2e. Sidecars: Postgres 16, Redis 7. `MOCK_ORDERS=true`. Live Kite tests are **not** in CI.

Dependabot opens weekly npm PRs; those also run this workflow.

---

## Before you touch production

1. **Snapshot** the Droplet (DigitalOcean → Droplet → Snapshots).
2. Backup Postgres (see [Backups](#backups)). Restore drill on a **copy**, not on the live DB.
3. Prefer **weekend / after market** for deploys. A restart can delay exits/square-off during market hours.
4. Confirm Kite redirect URL is `https://YOUR_HOST/api/redirect_url_kite`.
5. Confirm firewall: **22, 80, 443** only. Do **not** publish 5432 or 6379 to the internet.
6. Confirm Desk risk / `MOCK_ORDERS` — this doc does not turn on live orders.

SSH from the laptop:

```bash
ssh -o BatchMode=yes kha-ching-prod -- 'docker ps --format "table {{.Names}}\t{{.Status}}"'
```

---

## Choose a deploy path

| Option | When to use | Build happens | What to keep on the Droplet |
|---|---|---|---|
| **A. Git pull + rebuild in Docker** | You are on the server, or the image is small enough | **On the Droplet** (`docker compose build app`) | `.env` (compose is the git file) |
| **B. Build image on the laptop, load on the Droplet** | **Preferred on a 1 GB Droplet** — Next `yarn build` is heavy | **On the laptop** | `.env`; recreate app from the loaded image |
| **C. systemd, no Docker** | Fresh VM you install that way (not this Droplet) | On the VM (`yarn build`) | `/opt/kha-ching-app/.env` + unit file |

All Docker options still run **`yarn migrate` inside the app container** on start (`scripts/docker-entrypoint.sh`). Read new files in `drizzle/` before you ship.

---

## Option A — Git pull and rebuild on the Droplet (Docker)

Use this when you are happy compiling on the VM (needs RAM/swap; this box is tight).

```bash
ssh -o BatchMode=yes kha-ching-prod
cd /srv/khaching/app

git fetch origin
git rev-parse HEAD                    # note rollback SHA
git pull origin master

docker compose build app
docker compose up -d --no-deps app    # recreate app only; leave db/redis
docker compose ps
curl -fsS -m 8 http://127.0.0.1:3000/api/health
docker logs --tail 80 kha-ching-app
```

Do **not** run `docker compose down -v` (wipes database volumes).

---

## Option B — Build locally, push the image to Droplet Docker

Use this when the Droplet should **not** run `yarn build`. You still need git on the server in sync if you want matching source on disk; the **running code** is whatever is **inside the image** (including `drizzle/` SQL).

### 1. On the laptop (repo root)

```powershell
# Production-stage image (also runs yarn unit-test + yarn build in Docker)
docker compose build app

# Compose names this image <project>-app. Confirm:
docker images --format "{{.Repository}}:{{.Tag}}" | Select-String "app"
```

Tag it as the name the Droplet already runs (`app-app`):

```powershell
docker tag kha-ching-app-app:latest app-app:latest
# If the local repository name differs, retag that name instead:
# docker tag <local-image>:latest app-app:latest
```

### 2. Copy the image over SSH

PowerShell (no intermediate file):

```powershell
docker save app-app:latest | ssh -o BatchMode=yes kha-ching-prod "docker load"
```

If the pipe is flaky on Windows, use a file:

```powershell
docker save app-app:latest -o app-app.tar
scp app-app.tar kha-ching-prod:/tmp/app-app.tar
ssh -o BatchMode=yes kha-ching-prod -- "docker load -i /tmp/app-app.tar; rm /tmp/app-app.tar"
Remove-Item app-app.tar
```

### 3. Recreate only the app container (keep compose and .env)

```bash
ssh -o BatchMode=yes kha-ching-prod -- 'cd /srv/khaching/app && docker compose up -d --no-deps app'
ssh -o BatchMode=yes kha-ching-prod -- 'curl -fsS -m 8 http://127.0.0.1:3000/api/health'
ssh -o BatchMode=yes kha-ching-prod -- 'docker logs --tail 80 kha-ching-app'
```

Optional: `git pull` on `/srv/khaching/app` **without** replacing `docker-compose.yml` / `.env`, so the tree matches the image for debugging.

The entrypoint still migrates Postgres when the new container starts. If a **new** SQL file is in the image, that is a schema change — snapshot/backup first.

---

## Option C — systemd, no Docker (alternate install)

This is **not** how the current Droplet runs. Use it only on a host you installed that way.

You need on the server: Node 22, Yarn 4.9.1 (`corepack enable`), PostgreSQL 16, Redis 7, this git repo, a reverse proxy for HTTPS, and `deploy/kha-ching.service`.

```bash
sudo mkdir -p /opt/kha-ching-app
sudo git clone https://github.com/ssnathan78/kha-ching-app.git /opt/kha-ching-app
cd /opt/kha-ching-app
yarn install --immutable
yarn build
yarn migrate
sudo cp deploy/kha-ching.service /etc/systemd/system/
# Edit WorkingDirectory / EnvironmentFile if your path differs
sudo systemctl daemon-reload
sudo systemctl enable --now kha-ching
sudo systemctl status kha-ching
```

`deploy/kha-ching.service` runs `yarn start` (`node --require ./otel.js server.js`). Logs: `journalctl -u kha-ching -f`.

### New version (systemd)

```bash
cd /opt/kha-ching-app
sudo systemctl stop kha-ching
git pull
yarn install --immutable
yarn build
yarn migrate          # read the SQL if new files appeared
sudo systemctl start kha-ching
curl -fsS https://YOUR_HOST/api/health
```

### Rollback (systemd)

Keep the previous git commit id. `git checkout THAT_SHA && yarn build && systemctl restart kha-ching`. If a **forward** migration already ran, do not check out old code on a new schema unless you have a tested down-migration.

---

## Environment on the server

Copy `.env.example` to `/srv/khaching/app/.env` (Docker) or `/opt/kha-ching-app/.env` (systemd). Never commit it.

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `TZ` | `Asia/Kolkata` |
| `NEXT_PUBLIC_APP_URL` | `https://your.domain` (no trailing slash) |
| `SESSION_COOKIE_SECURE` | `true` (HTTPS). Compose on the Droplet may leave this unset; current code still treats HTTPS URLs as Secure cookies |
| `MOCK_ORDERS` | `false` **only** when you intend live orders |
| `DATABASE_URL` | Inside Docker: hostname **`db` or `postgres`** as in that compose file, not `127.0.0.1`. systemd: `127.0.0.1` |
| `REDIS_URL` | Inside Docker: hostname **`redis`**. systemd: `127.0.0.1` |
| `SECRET_COOKIE_PASSWORD` | 32+ random chars; **do not reuse** the local Docker password if that file ever leaked |
| `KITE_API_KEY` / `KITE_API_SECRET` | Production Kite app |
| `ALLOWED_KITE_USER_ID` | Your Zerodha user id — **required** in production (blocks other Kite accounts) |
| `HEALTH_CHECK_TOKEN` | Optional shared secret for `GET /api/health` (Bearer or `x-health-token`) |

Optional: `OTEL_EXPORTER_OTLP_ENDPOINT` and headers for Grafana Cloud.

**Security:** See [SECURITY_REVIEW.md](SECURITY_REVIEW.md) and [SECURITY_FINDINGS.md](SECURITY_FINDINGS.md). Do **not** publish Postgres (5432) or Redis (6379) to the internet.

Docker on the Droplet should:

- Bind app `3000` to `127.0.0.1` only
- Leave Postgres/Redis on the Docker network only
- Put TLS in front (host nginx or Caddy)

---

## Database: first boot vs later

On a **new** empty database, `yarn migrate` applies `drizzle/*.sql` in order (`0000_init.sql`, `0000_integrity.sql`, then numbered files).

If you already have a database from an older install, **do not** blindly re-run init against a different schema. Backup first. `yarn drizzle:push` can sync Drizzle schema in a pinch (dev-ish); prefer SQL migrations you have read.

Daily cleanup (tokens and old EMA rows) is SQL function `cleanup_old_records()`, called when a **new** access token is stored.

## Redis

Bind Redis to the Docker network or **127.0.0.1**. Set `requirepass` if more than one user can log into the VM. BullMQ stores jobs here; wiping Redis cancels pending schedules. Do not print `bull:*` key names (they include `KITE_API_KEY`).

## HTTPS

Point DNS A record at the Droplet. Use Caddy or nginx to proxy to `127.0.0.1:3000`. Session cookies are **Secure** in production so they only travel on HTTPS.

## Backups

Scripts:

- `scripts/backup-db.sh` — `pg_dump` gzip
- `scripts/restore-db.sh` — restore a dump

Cron example (as the postgres-capable user, systemd layout):

```
15 16 * * 1-5 /opt/kha-ching-app/scripts/backup-db.sh
```

On Docker, run dump via `docker compose exec postgres` against `kha-ching-postgres` (do not log the password). Copy dumps **off** the Droplet. A snapshot + dump is better than dump alone.

## Docker rollback

1. Note `docker inspect kha-ching-app --format '{{.Config.Image}}'` and `git -C /srv/khaching/app rev-parse HEAD`.
2. Load the previous `app-app` image (or `git checkout` + rebuild).
3. `docker compose up -d --no-deps app`.
4. If a **forward** migration already ran, old code on a new schema is unsafe — restore DB from dump on a **copy** first.

## App Platform / `.do/`

Ignore for production. Those templates would run Next without `server.js`.

## Security checklist

- [ ] 5432 and 6379 not on the public internet
- [ ] App 3000 not published on `0.0.0.0`
- [ ] SSH keys only, no password SSH if possible
- [ ] Kite secret and cookie password not in git
- [ ] `MOCK_ORDERS=false` only when you mean it
- [ ] Redirect URL on kite.trade matches HTTPS
- [ ] After any secret leak: rotate Kite secret, cookie password, DB password
- [ ] Compose ports bind `127.0.0.1` only (not `0.0.0.0`)
