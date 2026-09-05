# Production security

Repository expectations plus what to verify over SSH. **No production changes in this document.** Apply hardenings only after you approve each one.

## SSH (laptop → Droplet)

Recommended:

```
Any coding agent or human terminal (same Windows user)
    → OpenSSH (key + ssh-agent, BatchMode)
    → Droplet sshd :22
    → senthil (docker without sudo; sudo needs a password)
    → docker / nginx / localhost:3000
```

Step-by-step, reboot reminder, and switching tools: [SSH.md](./SSH.md).

| Control | Recommendation | In repo? |
|---|---|---|
| Key auth | Ed25519; no password SSH | You already have `~/.ssh/id_ed25519` locally |
| Host alias | `Host kha-ching-prod` in **laptop** `~/.ssh/config` | Example only: `docs/ssh-config.example` |
| Agent | Windows OpenSSH `ssh-agent`; `ForwardAgent no` | Not in repo |
| Root login | `PermitRootLogin no` (or `prohibit-password` until a sudo user exists) | Unknown on Droplet |
| Password auth | `PasswordAuthentication no` | Unknown on Droplet |
| Fail2ban | Optional, sshd jail | Not provisioned by this repo |
| Firewall | DO Cloud Firewall + UFW: 22, 80, 443 | Not provisioned by this repo |

Do **not** commit `~/.ssh/config` or private keys. `*.pem` is gitignored. Keep IdentityFile paths on the laptop only.

Least privilege: a deploy user that can `systemctl restart kha-ching` (or docker) via sudoers, not daily root SSH.

## Secrets

| Secret | Where it should live | Never |
|---|---|---|
| `.env` | Server only (`/opt/kha-ching-app/.env` or compose env) | Git, chat, health-script stdout |
| `SECRET_COOKIE_PASSWORD` | `.env` | Reuse local Docker password |
| `KITE_API_SECRET` | `.env` | Logs, queue names in chat |
| DB / Redis passwords | `.env` / Redis `requirepass` | Public 5432/6379 |
| `HEALTH_CHECK_TOKEN` | `.env` if health is public | Query strings in browsers |

Report presence: `KITE_API_SECRET = configured`. Do not print values.

Queue names are `tradingQueue_${KITE_API_KEY}` — treat names as sensitive.

## Network

Must **not** be on the public internet:

- PostgreSQL `5432`
- Redis `6379`
- Node `3000` if the proxy is the only public HTTP entry (prefer bind `127.0.0.1` or firewall 3000)

`docker-compose.yml` in this repo **publishes 5432 and 6379**. That is for local Docker Desktop. If production used compose as-is, that is a finding — fix only after approval.

DigitalOcean Cloud Firewall should allow 22 (your IP if possible), 80, 443.

## TLS and cookies

Production HTTPS:

- `NEXT_PUBLIC_APP_URL=https://your.domain` (no trailing slash)
- `SESSION_COOKIE_SECURE=true` (or omit when the URL is https)
- Kite redirect `https://YOUR_HOST/api/redirect_url_kite`
- HTTP → HTTPS at the proxy

Local Docker uses `SESSION_COOKIE_SECURE=false` on purpose ([LOCAL.md](./LOCAL.md)).

## Application controls

| Control | Production expectation |
|---|---|
| `NODE_ENV` | `production` |
| `ALLOWED_KITE_USER_ID` | Required; blocks other Kite accounts |
| `MOCK_ORDERS` | `true` unless you intend live orders **and** Desk → Risk “Allow live orders” **and** that strategy is Live |
| Rate limit | In-process on sensitive routes (`lib/rateLimit.js`) |
| `/queues` | Session-gated on `server.js` |
| `/api/health` | Optional bearer / `x-health-token` |

There are **no roles**. Any valid session is a full operator. Network + allowlist + cookie secret are the boundary.

## Remaining risks (from SECURITY_REVIEW)

1. Kite access token in the session cookie (single-operator design).
2. In-memory rate limits (one process).
3. Compose/dev ports if copied to a public VM.
4. Manual deploy — no CI gate on the Droplet itself.
5. Holiday/calendar and live trading still depend on operator discipline (`MOCK_ORDERS`, Desk risk).

## SSH audit checklist (read-only first)

After `ssh kha-ching-prod` works, collect (do not “fix” in the same breath):

- [ ] `sshd -T` passwordauthentication / permitrootlogin
- [ ] `~/.ssh` on the server: `700` / `authorized_keys` `600`
- [ ] Cloud firewall + `ufw status`
- [ ] Listening ports: only 22/80/443 public
- [ ] 5432/6379 not on `0.0.0.0`
- [ ] fail2ban present or accepted absence
- [ ] `unattended-upgrades` / pending security updates (report only)
- [ ] `.env` not world-readable

Propose each hardening, then wait for approval.

## As observed (2026-09-05, read-only)

| Item | Observation |
|---|---|
| SSH | Key auth for `senthil`; laptop key is passphrase-protected; agent required for `BatchMode` |
| sudo | `senthil` is in `sudo` and `docker`; sudo **needs a password** (agent cannot elevate) |
| fail2ban / UFW | Both **active**. UFW allows **22** and **80/443** only (operator-confirmed `ufw status verbose`) |
| Listen | 22, 80, 443 on `0.0.0.0`; app **3000 on 127.0.0.1 only** (bound 2026-09-05) |
| External probe | Before bind: 3000 was open. After: confirm 3000 closed, 443 open. 5432/6379 closed. |
| DB / Redis | Docker network only (good) |
| TLS | Self-signed, 1-year, CN = IPv4 |
| `MOCK_ORDERS` | `true` |
| Compose | DB password appears in server `docker-compose.yml` (finding; value not recorded here) |
| sshd -T | Not read (sudo) |

Do not change UFW, nginx, or compose until you approve a specific command.
