# Production health

Last audit: **2026-09-05** (read-only SSH as `senthil@kha-ching-prod`). No services were restarted. No `.env` values were printed.

How to repeat:

```powershell
ssh -o BatchMode=yes kha-ching-prod -- uname -a
# Strip CR if piping this repo's script from Windows:
$h = [IO.File]::ReadAllText("scripts\production-health-check.sh").Replace("`r`n","`n")
$h | ssh -o BatchMode=yes kha-ching-prod "bash -s"
```

After a **Windows** reboot (not the Droplet), `Start-Service ssh-agent` if needed, then `ssh-add`, then `BatchMode` works again. See [SSH.md](./SSH.md).

## Current health

| Check | Result |
|---|---|
| SSH `BatchMode` to `kha-ching-prod` | OK (agent must hold the key) |
| OS | Ubuntu **24.04**, kernel 6.8.0-124-generic, host `ssnathan-blr1-1` |
| Uptime | ~1 day |
| CPU | **1** vCPU (`DO-Regular`) |
| RAM | **961 MiB** total; ~556 MiB used; **289 MiB swap used** (tight) |
| Disk | 24G root, **53%** used (13G / 12G free) |
| Install style | **Docker Compose**, not systemd `kha-ching.service` |
| App dir on host | `/srv/khaching/app` |
| Git at deploy | `bd4f472` (2026-08-13) — **weeks behind** current laptop repo |
| Host Node / Yarn | v18.19.1 / 4.18.0 (host tools; app runs in the container) |
| Container image | locally built `app-app` (Dockerfile `production` target) |
| App process | `kha-ching-app` Up **21h (healthy)**, restart count **0** |
| `GET /api/health` | **200** `{ status: ok, service: kha-ching }` (older payload; no `checks` object) |
| Postgres | `kha-ching-db` **postgres:16-alpine**, healthy, `pg_isready` OK; **5432 not published** on the host |
| Redis | `kha-ching-redis` **redis:7-alpine**, healthy, `PONG`; **6379 not published** on the host |
| BullMQ | **6** `bull:*:meta` keys (names not printed) |
| Proxy | **nginx** 1.24.0, enabled, HTTP→HTTPS, proxy to `127.0.0.1:3000` |
| TLS | **Self-signed**, CN = Droplet IPv4, valid **2026-09-04 → 2027-09-04** |
| Public listen | Host: **22, 80, 443** on `0.0.0.0`. App **3000 bound to 127.0.0.1 only** (changed 2026-09-05). |
| UFW policy | **active**, default deny incoming. Allows only **22** and **80,443** (Nginx Full), IPv4+IPv6. |
| Reachable from this laptop | After bind: **3000 should be closed**; **443 still open**. **5432 and 6379 closed**. |
| fail2ban | systemd **active** (jails not listed: same sudo limit) |
| `NODE_ENV` | `production` |
| `MOCK_ORDERS` | `true` (paper orders from this process) |
| `SESSION_COOKIE_SECURE` | **unset** (HTTPS URL still implies Secure cookies in current code) |
| `TZ` | `Asia/Kolkata` |
| `PORT` | `3000` |
| `NEXT_PUBLIC_APP_URL` | `https://<droplet-ipv4>` (no hostname) |
| `HEALTH_CHECK_TOKEN` | not confirmed (health is reachable without a token) |
| Secret presence | `.env` **present** on the host; Kite/DB URLs were **not** dumped. App talks to Kite (see logs). |
| Recent crashes | App/Redis restart count 0 |
| Log noise | Chase `failed to get chase status` (null). Ancillary **15:30 IST**: Kite `TokenException` incorrect api_key/access_token |

## Architecture observed

```
Internet
  → :80 nginx 301 HTTPS
  → :443 nginx (self-signed) proxy_pass 127.0.0.1:3000
  → also :3000 published on all interfaces (Compose)
  → kha-ching-app (Node in Docker, workers in-process)
       → kha-ching-db (Postgres 16, Docker network only)
       → kha-ching-redis (Redis 7, Docker network only)
       → Kite (outbound)
```

Not used on this box: Caddy, `/opt/kha-ching-app`, systemd unit `kha-ching`.

## Known problems / gaps

1. **Port 3000 was reachable from the internet** (Docker bypassed UFW). **Fixed 2026-09-05:** Compose `app` ports set to `127.0.0.1:3000:3000`; `kha-ching-app` recreated. nginx HTTPS still 200. Leave `app-dev` profile mapping unchanged.
2. **Self-signed cert on a raw IP.** Browser warnings; no Let’s Encrypt hostname yet.
3. **Deploy SHA `bd4f472` (13 Aug)** vs current development on the laptop. Ledger/risk/simulation work is **not** what’s running.
4. **1 GB RAM + swap in use.** Fine for idle; watch during market open.
5. **Compose on the server embeds DB credentials in YAML** (not only `.env`). Do not commit that file; consider moving the password to env and rotating if the compose file is broadly readable.
6. **Kite TokenException at square-off/ancillary time** — usually missing/expired login session, not a down site. Health still OK.
7. **Chase status null** on the running build — inspect after you decide whether to debug old prod or deploy current code.
8. **sudo on `senthil` requires a password**, so the agent cannot read `ufw`/`sshd -T` without you. Run those yourself if you want the remaining SSH/firewall rows.
9. Host `node -v` is 18; the container is what matters.

## Monitoring gaps (unchanged recommendation)

Uptime on `/api/health`, DigitalOcean disk/RAM, TLS expiry (self-signed already dated), watch `MOCK_ORDERS`, and journal/docker logs for TokenException / risk / unexpected orders. No extra SaaS required.

## What I did **not** do

Restart containers, edit nginx, change UFW, read `.env` values, migrate, flush Redis, or any Kite order action.
