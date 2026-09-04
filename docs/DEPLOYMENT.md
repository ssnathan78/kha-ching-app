# Deployment (DigitalOcean Droplet or any Linux VPS)

This guide assumes you have used SSH before, but not that you know this app. Production is **one VM**, not Kubernetes and not DigitalOcean App Platform.

Why one VM: BullMQ **workers run in the same Node process** as `server.js`. A platform that only runs `next start` will skip workers and `/queues`.

## What you are installing

On the server you need:

- Node.js **20**
- Yarn Classic **1.22**
- PostgreSQL **16**
- Redis **7**
- This git repo
- A reverse proxy (Caddy or nginx) for **HTTPS**
- systemd unit `deploy/kha-ching.service` so the app restarts on reboot

Alternatively, install Docker on the Droplet and run the same `docker compose` file, with `SESSION_COOKIE_SECURE=true`, `NODE_ENV=production`, `MOCK_ORDERS=false` (only when you want live orders), and `NEXT_PUBLIC_APP_URL=https://your.domain`.

## Before you touch production

1. **Snapshot** the Droplet (DigitalOcean → Droplet → Snapshots).
2. Backup Postgres (see below). Restore drill on a **copy**, not on the live DB.
3. Confirm Kite redirect URL is `https://YOUR_HOST/api/redirect_url_kite`.
4. Confirm firewall: **22, 80, 443** only. Do **not** publish 5432 or 6379 to the internet.

## GitHub Actions

`.github/workflows/ci.yml` runs on push: `yarn install --frozen-lockfile`, lint, unit tests, `yarn build`. **CI does not deploy.** You pull on the server (or copy an image) yourself.

## Environment on the server

Copy `.env.example` to `/opt/kha-ching-app/.env` (or wherever `WorkingDirectory` is).

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `TZ` | `Asia/Kolkata` |
| `NEXT_PUBLIC_APP_URL` | `https://your.domain` (no trailing slash) |
| `SESSION_COOKIE_SECURE` | `true` |
| `MOCK_ORDERS` | `false` only when you intend live orders |
| `DATABASE_URL` | `postgresql://USER:PASS@127.0.0.1:5432/trading_db` |
| `REDIS_URL` | `redis://127.0.0.1:6379` (add a password in Redis config) |
| `SECRET_COOKIE_PASSWORD` | 32+ random chars; **do not reuse** the local Docker password if that file ever leaked |
| `KITE_API_KEY` / `KITE_API_SECRET` | Production Kite app |

Optional: `OTEL_EXPORTER_OTLP_ENDPOINT` and headers for Grafana Cloud.

## Database: first boot vs later

On a **new** empty database, `yarn migrate` applies:

- `drizzle/0000_init.sql` — tables
- `drizzle/0000_integrity.sql` — unique index on `transactions.order_id`, helper function

If you already have a database from an older install, **do not** blindly re-run init against a different schema. Backup first. `yarn drizzle:push` can sync Drizzle schema in a pinch (dev-ish); prefer SQL migrations you have read.

Daily cleanup (tokens and old EMA rows) is SQL function `cleanup_old_records()`, called when a **new** access token is stored.

## Redis

Bind Redis to **127.0.0.1**. Set `requirepass` if more than one user can log into the VM. BullMQ stores jobs here; wiping Redis cancels pending schedules.

## App install (systemd, no Docker)

```bash
sudo mkdir -p /opt/kha-ching-app
sudo git clone https://github.com/ssnathan78/kha-ching-app.git /opt/kha-ching-app
cd /opt/kha-ching-app
# Node 20 + corepack or npm i -g yarn@1.22.22
yarn install --frozen-lockfile
yarn build
yarn migrate
sudo cp deploy/kha-ching.service /etc/systemd/system/
# Edit WorkingDirectory / EnvironmentFile if your path differs
sudo systemctl daemon-reload
sudo systemctl enable --now kha-ching
sudo systemctl status kha-ching
```

`deploy/kha-ching.service` runs `yarn start` (`node --require ./otel.js server.js`).

Logs: `journalctl -u kha-ching -f`.

## HTTPS

Point DNS A record at the Droplet. Use Caddy or nginx to proxy to `127.0.0.1:3000`.

The Node process should listen on localhost (or all interfaces behind the proxy). Session cookies are **Secure** in production so they only travel on HTTPS.

## Docker on the Droplet

You can use the repo `Dockerfile` + compose, but then:

- Set compose `SESSION_COOKIE_SECURE` to `"true"`
- Set `NEXT_PUBLIC_APP_URL` to your `https://` URL
- Do not publish Postgres/Redis ports on `0.0.0.0`
- Put TLS in front (Caddy container or host nginx)

## Backups

Scripts:

- `scripts/backup-db.sh` — `pg_dump` gzip
- `scripts/restore-db.sh` — restore a dump

Cron example (as the postgres-capable user):

```
15 16 * * 1-5 /opt/kha-ching-app/scripts/backup-db.sh
```

Copy dumps **off** the Droplet (Spaces, another disk). A snapshot + dump is better than dump alone.

## Deploying a new version (manual)

```bash
cd /opt/kha-ching-app
sudo systemctl stop kha-ching
git pull
yarn install --frozen-lockfile
yarn build
yarn migrate          # read the SQL if new files appeared
sudo systemctl start kha-ching
curl -fsS https://YOUR_HOST/api/health
```

## Rollback

Keep the previous git commit id. `git checkout THAT_SHA && yarn build && systemctl restart kha-ching`. Keep a copy of `.next` if you want a faster revert.

## App Platform / `.do/`

Ignore for production. Those templates would run Next without `server.js`.

## Security checklist

- [ ] 5432 and 6379 not on the public internet
- [ ] SSH keys only, no password SSH if possible
- [ ] Kite secret and cookie password not in git
- [ ] `MOCK_ORDERS=false` only when you mean it
- [ ] Redirect URL on kite.trade matches HTTPS
- [ ] After any secret leak: rotate Kite secret, cookie password, DB password
