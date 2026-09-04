# Deployment (DigitalOcean Droplet)

Recommended: **one Droplet**, Node + Postgres + Redis, reverse proxy for HTTPS. Do not use Kubernetes or App Platform for this app (workers must stay in-process with `server.js`).

## AUTOMATED (in repo)

- Docker image (`Dockerfile`)
- `docker compose` for app; profile `local` for Postgres/Redis
- GitHub Actions: install, lint, unit tests, build (no auto-deploy)
- `scripts/backup-db.sh` / `scripts/restore-db.sh`
- `deploy/kha-ching.service`

## MANUAL PRODUCTION ACTION REQUIRED

1. Snapshot the Droplet before deploy.
2. `pg_dump` (or run `scripts/backup-db.sh`) and confirm the file is not empty.
3. Copy code, `yarn install --immutable`, `yarn build`.
4. `yarn migrate` or `yarn drizzle:push` after backup.
5. Install systemd unit; `Environment=TZ=Asia/Kolkata`.
6. nginx/Caddy TLS; firewall: 22, 80, 443 only. **Do not expose 5432/6379.**
7. Redis bind localhost + password if the host is shared.
8. Rotate `KITE_API_SECRET` / `SECRET_COOKIE_PASSWORD` if they ever leaked.
9. `MOCK_ORDERS=false` only when you intend live orders.
10. Restore drill: `scripts/restore-db.sh backups/....sql.gz` on a copy, not blindly on prod.

## Rollback

Keep previous `.next` and git tag. `git checkout <tag> && yarn build && systemctl restart kha-ching`.

## App Platform

`.do/` templates are **not** the production path. `next start` without `server.js` would skip Bull Board and the custom server.
