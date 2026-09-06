# Production runbook

Trading desk. Default is **read-only**. Labels:

| Label | Meaning |
|---|---|
| **SAFE / READ-ONLY** | Inspect only. Preferred. |
| **CAUTION** | Can interrupt service or drop in-memory state. Needs a reason. |
| **DANGEROUS / REQUIRES APPROVAL** | Can lose money, mutate data, or change live trading. Wait for explicit approval. |

Do not paste private keys, `.env` values, or Kite tokens into chat or git.

SSH is **laptop OpenSSH** + host alias `kha-ching-prod`. Full setup, Windows `ssh-agent` reminder, and how **any** coding agent connects: [SSH.md](./SSH.md). Template: [ssh-config.example](./ssh-config.example).

```bash
ssh -o BatchMode=yes kha-ching-prod -- uname -a
```

If that host is missing, stop. Do not invent `HostName` or `User`.

**This Droplet (2026-09):** Docker at `/srv/khaching/app` (`kha-ching-app` / `kha-ching-db` / `kha-ching-redis`). nginx on 80/443. App port **3000 is localhost-only**. There is no systemd `kha-ching.service`.

---

## SSH

**SAFE / READ-ONLY**

```bash
ssh -o BatchMode=yes kha-ching-prod -- 'whoami; hostname; pwd'
```

Same command in Windows PowerShell. Agents must use `BatchMode=yes`. After a **Windows** reboot (not Droplet, not closing the terminal): `Start-Service ssh-agent` if needed, then `ssh-add`. Details: [SSH.md](./SSH.md).

---

## Application status

**SAFE / READ-ONLY**

systemd (if that is how it was installed):

```bash
ssh -o BatchMode=yes kha-ching-prod -- 'systemctl is-active kha-ching; systemctl status kha-ching --no-pager'
```

Docker (if that is how it was installed):

```bash
ssh -o BatchMode=yes kha-ching-prod -- 'docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"'
```

Health (localhost on the Droplet; does not print secrets):

```bash
ssh -o BatchMode=yes kha-ching-prod -- 'curl -sS -m 8 -o /tmp/h.json -w "%{http_code}\n" http://127.0.0.1:3000/api/health; python3 -c "import json;print(json.load(open(\"/tmp/h.json\")))"'
```

If `HEALTH_CHECK_TOKEN` is set, unauthenticated `/api/health` returns 401. Use a token only in the SSH session; do not paste it into the repo.

Repeatable bundle:

```bash
ssh -o BatchMode=yes kha-ching-prod "bash -s" < scripts/production-health-check.sh
```

---

## Workers

Workers are **not** a second systemd unit. They start inside `server.js` when `lib/session.ts` loads queue processors.

**SAFE / READ-ONLY**

```bash
ssh -o BatchMode=yes kha-ching-prod -- 'ps aux | grep -E "[n]ode|[y]arn" | grep -v grep'
```

Do **not** print Redis `bull:*` key names (they include `KITE_API_KEY`). Count only:

```bash
ssh -o BatchMode=yes kha-ching-prod -- 'redis-cli --scan --pattern "bull:*:meta" | wc -l'
```

Logged-in operator UI: `https://YOUR_HOST/queues` (session required).

---

## Logs

**SAFE / READ-ONLY**

```bash
# systemd
ssh -o BatchMode=yes kha-ching-prod -- 'journalctl -u kha-ching -n 200 --no-pager'

# docker
ssh -o BatchMode=yes kha-ching-prod -- 'docker logs --tail 200 kha-ching-app'

# proxy (paths vary; do not assume)
ssh -o BatchMode=yes kha-ching-prod -- 'sudo journalctl -u nginx -n 100 --no-pager'
ssh -o BatchMode=yes kha-ching-prod -- 'sudo journalctl -u caddy -n 100 --no-pager'
```

Look for: 5xx, Kite errors, risk rejects, worker crashes, Redis/Postgres disconnects. Redact tokens if a log line includes them.

---

## Database

**SAFE / READ-ONLY** (connectivity / migration files only)

```bash
ssh -o BatchMode=yes kha-ching-prod -- 'pg_isready -h 127.0.0.1 -p 5432'
ssh -o BatchMode=yes kha-ching-prod -- 'ls /opt/kha-ching-app/drizzle/*.sql'
```

**DANGEROUS / REQUIRES APPROVAL**

- `yarn migrate` / `yarn drizzle:push`
- Any `psql` that writes
- `scripts/restore-db.sh`

Backup (writes dump files; still not a trade): **CAUTION** — `scripts/backup-db.sh`

Never print `DATABASE_URL`.

---

## Redis

**SAFE / READ-ONLY**

```bash
ssh -o BatchMode=yes kha-ching-prod -- 'redis-cli ping'
```

**DANGEROUS / REQUIRES APPROVAL**

`FLUSHALL`, `FLUSHDB`, deleting `bull:*` keys. That cancels scheduled entries, exits, Chase, and square-off.

---

## Nginx / Caddy / TLS

**SAFE / READ-ONLY**

```bash
ssh -o BatchMode=yes kha-ching-prod -- 'sudo nginx -t'
ssh -o BatchMode=yes kha-ching-prod -- 'systemctl is-active nginx caddy'
PUBLIC_HOST=your.domain ssh -o BatchMode=yes kha-ching-prod -- "PUBLIC_HOST=your.domain bash -s" < scripts/production-health-check.sh
```

There is no proxy config in git. Inspect `/etc/nginx` or `/etc/caddy` on the server.

---

## Disk / memory / CPU

**SAFE / READ-ONLY**

```bash
ssh -o BatchMode=yes kha-ching-prod -- 'df -h; free -h; uptime; nproc'
```

---

## Restart services

**CAUTION** — drops in-flight HTTP and can interrupt workers. Does **not** by itself place a Kite order, but a restart during market hours can delay exits/square-off.

```bash
# systemd
sudo systemctl restart kha-ching

# docker
docker compose restart app
```

**DANGEROUS / REQUIRES APPROVAL** if live positions exist or it is market hours.

---

## Deploy

**CAUTION** / **DANGEROUS** during market hours.

This Droplet is **Docker** at `/srv/khaching/app`. CI does **not** deploy.

Preferred on 1 GB RAM: build the production image on the laptop and `docker load` on the Droplet ([DEPLOYMENT.md](./DEPLOYMENT.md) option B). Alternative: `git pull` + `docker compose build app` on the server (option A). Compose is the git file (ports on `127.0.0.1` only); keep a Droplet-only **`.env`**.

systemd path (other hosts only):

```bash
cd /opt/kha-ching-app
sudo systemctl stop kha-ching
git pull
yarn install --immutable
yarn build
yarn migrate
sudo systemctl start kha-ching
curl -fsS https://YOUR_HOST/api/health
```

Do not hotfix files on the Droplet as the permanent fix — commit in git.

---

## Rollback

**CAUTION**

1. Note current `git rev-parse HEAD`.
2. `git checkout <known-good-sha>`
3. `yarn install --immutable && yarn build`
4. Start the app.
5. If a **forward** migration already ran, do not “roll back” by checking out old code on a new schema unless you have a tested down-migration. Prefer restore from `pg_dump` on a **copy** first.

Keep Droplet snapshots + off-box dumps.

---

## Health checks

**SAFE / READ-ONLY** — `scripts/production-health-check.sh` (this repo).

Also `node ./bootup.js` on the server (`yarn healthcheck`) hits `localhost:${PORT}/api/health`.

---

## Reconciliation

**SAFE / READ-ONLY** first: Desk UI, `/queues`, job_executions, ledger tables, Kite order book (read APIs).

**DANGEROUS / REQUIRES APPROVAL**: any flatten, cancel, or `POST /api/kill-desk`.

---

## Emergency (non-trading)

| Situation | First action | Label |
|---|---|---|
| App not responding | Health script + logs | SAFE |
| Disk full | `df -h`, rotate logs | CAUTION to delete |
| Certificate expired | Inspect dates, renew | CAUTION |
| Postgres/Redis down | Do not flush Redis | SAFE inspect |

---

## Emergency (trading) — **DANGEROUS / REQUIRES APPROVAL**

Anything that can submit, cancel, or change a real order or position.

| Situation | Prefer | Do not |
|---|---|---|
| Unexpected live orders | Confirm `MOCK_ORDERS` and Desk “Allow live orders”. Inspect, then approve flatten/kill if needed | Casually `MOCK_ORDERS=false` |
| Runaway jobs | Inspect `/queues` and `job_executions` | `FLUSHALL` |
| Broker errors | Read logs + Kite status | Blind retry of entry jobs |
| Need to halt entries | Desk → Risk halt, or approved `POST /api/kill-desk` | Kill -9 the Node process during an in-flight order unless you accept unknown broker state |

Kill-desk and Desk risk changes are **operator actions**. The agent must print the exact command and wait.

---

## Debugging workflow

1. Observe (logs, processes, health, recent deploy).
2. Reproduce locally or in simulation when possible (`yarn sim-test`).
3. Diagnose request → app → DB/Redis → Kite → worker → response.
4. Root cause (not first symptom). Why production-only? Why tests missed it?
5. Fix in git → test → build → deploy → verify.
6. Do not leave uncommitted edits on the Droplet.

---

## Any coding agent (Cursor or later)

The tool does not need a DigitalOcean integration. It runs the same SSH command your terminal does. Copy the “Tell the new tool” block in [SSH.md](./SSH.md) into that product’s rules if you switch.

```bash
ssh -o BatchMode=yes kha-ching-prod -- <read-only>
```

Then explain evidence and **ask before** restarts, deploys, migrations, or trading actions. Do not upload the private key to a cloud-only agent.
