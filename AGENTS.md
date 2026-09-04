# Agent notes (Kha-Ching)

This file is for coding agents (Cursor, Claude, etc.). Humans should start at [README.md](README.md).

## Non-negotiables

- Personal live-trading app for **Indian** index options via **Zerodha Kite**.
- **Yarn Classic 1.22** (`packageManager` in `package.json`). Lockfile is Yarn v1. Never switch the lockfile to Yarn Berry without an explicit migration.
- `MOCK_ORDERS=true` unless the operator asked for live orders.
- Do not change **strategy points** in `lib/targetPnL.ts` to rupee-weighted P&amp;L. The UI shows **both** rupees and points on purpose (`lib/pnl.ts`).
- Do not commit `.env` or tokens.
- Timezone is **Asia/Kolkata**.
- New code: TypeScript. Linter: **Biome** (`yarn lint`), not ESLint.

## How the process boots

`server.js` is the real entrypoint (`yarn dev` / `yarn start`). It mounts Next.js and Bull Board at `/queues`. Do not recommend `next start` alone — workers would not start the same way.

API session helper `lib/session.ts` **side-imports** queue processors, exit strategies, and watchers so workers start with the web process.

## Docker

- Default compose target is **production** image + `NODE_ENV=production` + `SESSION_COOKIE_SECURE=false` + `MOCK_ORDERS=true` for local HTTP.
- Entrypoint: `scripts/docker-entrypoint.sh` → `yarn migrate` → `yarn start`.
- First-time schema: `drizzle/0000_init.sql` then `drizzle/0000_integrity.sql`.

## Tests

```bash
yarn unit-test
```

Integration tests need running Postgres/Redis.

## Docs to update when you change behaviour

Login/cookies → `docs/LOCAL.md`, `docs/TROUBLESHOOTING.md`.  
Queues/schema → `docs/ARCHITECTURE.md`.  
Ship to a server → `docs/DEPLOYMENT.md`.  
Commands/stack → `CLAUDE.md` and this file.

Longer project map: [CLAUDE.md](CLAUDE.md).
