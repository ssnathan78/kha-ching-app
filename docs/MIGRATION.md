# Full Stack Modernization Migration

Record of the major-version upgrade to the modern stack.

## Version matrix

| Component | Before | After | Phase |
|-----------|--------|-------|-------|
| Node | >=20 (CI/Docker: 20) | >=22.13 (CI/Docker: 22) | 0 |
| Yarn | Classic 1.22.22 | Berry 4.9.1 (`nodeLinker: node-modules`) | 0 |
| React | 18.3.1 | 19.2.8 | 1 |
| MUI | 5.15 + x-date-pickers 5 | 9.4 + x-date-pickers 9.13 | 2 |
| Drizzle ORM / Kit | 0.45.2 / 0.31.10 | 0.45.2 / 0.31.10 (already latest) | 3 |
| iron-session | 8.0.4 | 9.0.1 | 4 |
| BullMQ | 5.73 | 6.3.4 | 5 |
| Bull Board | 7.x | 9.8.0 | 5 |
| ioredis | 5.6 | 6.0.0 | 5 |
| Jest | 29.7 | 30.5.1 | 6 |
| Biome | 2.4.11 | 2.5.12 | 6 |
| lodash | 4.17 | removed (native JS) | 6 |

## Phase 0 — Node + Yarn Berry

- Pinned Yarn Berry via `.yarn/releases/yarn-4.9.1.cjs` and `yarnPath` in `.yarnrc.yml`.
- Kept `nodeLinker: node-modules` for Next.js, Jest, Playwright, and kiteconnect compatibility.
- CI: Node 22, `corepack enable`, `yarn install --immutable`.
- Docker: `node:22-alpine`, Berry via `packageManager` field.

## Phase 1 — React 19

- Upgraded `react`, `react-dom`, `@types/react`, `@types/react-dom`, `react-test-renderer`.
- Removed obsolete JSS cleanup effect from `pages/_app.tsx`.

## Phase 2 — MUI 9

- Removed `@mui/lab` (unused).
- Migrated legacy `Grid` (`item`/`xs`) to MUI 9 `Grid` with `size` prop (13 files).
- Replaced `TimePicker` `renderInput` with `slotProps.textField` (straddle/strangle forms).
- Hoisted `LocalizationProvider` + `AdapterDayjs` to `pages/_app.tsx`.
- Moved Stack/Typography system props (`alignItems`, `flexWrap`, `display`, etc.) into `sx` where MUI 9 requires it.
- TextField `inputProps` → `slotProps.htmlInput`.

## Phase 3 — Drizzle

- Verified `drizzle-orm` and `drizzle-kit` are already at latest stable; no API changes required.

## Phase 4 — iron-session 9

- Upgraded to iron-session 9.x (Node >=22.13).
- Added `onUnsealError` logging in `getSessionOptions()`.
- Sanitized Kite `login_time` (no `Date` objects in sealed cookie) in `pages/api/redirect_url_kite.ts`.

## Phase 5 — BullMQ 6 + Bull Board 9

### Scheduler migration (Phase 5a, on BullMQ 5 API before v6 bump)

Replaced legacy `chaseQueue.add(..., { repeat: ... })` with `upsertJobScheduler`:

| Scheduler ID | Job name | Cron (IST) |
|--------------|----------|------------|
| `chase-calculateEMA` | `calculateEMA` | `15 10-16 * * *` |
| `chase-updateSL` | `updateSL` | `0 * 9-15 * * *` |

Fixed scheduler removal in `lib/jobControl.ts` and `pages/api/delete_job.js` to use `chaseQueue.removeJobScheduler` (was incorrectly calling `tradingQueue.removeRepeatableByKey`).

### Phase 5b

- Upgraded `bullmq`, `@bull-board/*`, `ioredis`.
- Added worker graceful shutdown via `lib/queue-processor/index.ts` → `lib/shutdown.js` → `server.js` SIGTERM/SIGINT.
- Added `chaseQueue_${QID}` to `scripts/bull-board.js`.

### Redis migration (deploy checklist)

Before deploying BullMQ 6 workers against an existing Redis instance:

1. Stop all workers.
2. Remove legacy BullMQ 5 `repeat:` metadata keys for `chaseQueue_${QID}`.
3. Deploy code with `upsertJobScheduler` and verify schedulers in Bull Board.
4. Start BullMQ 6 workers.

**Modernization (2026):** Legacy `"repeat"` queue-id shims were removed from `lib/jobControl.ts` and `pages/api/delete_job.js`. Only `CHASE_EMA_SCHEDULER_ID` and `CHASE_UPDATE_SL_SCHEDULER_ID` are recognized for scheduler removal. If old Redis keys remain, run step 2 above before deploy.

## Phase 6 — Secondary deps

- Jest 30, `@testing-library/dom` peer, Biome 2.5.12 schema migration.
- Removed `lodash`; replaced `omit`/`pick`/`uniqBy` with native destructuring/Set.

## Breaking changes log

- **MUI 9:** System props on `Stack`/`Typography` must use `sx`. `Grid` uses `size` not `item`/`xs`. Date pickers use `slotProps` not `renderInput`.
- **BullMQ 6:** No `removeRepeatableByKey`; use `removeJobScheduler`. No `repeat` on `Queue.add` for Chase.
- **iron-session 9:** Session payload must be JSON-serializable (no `Date` objects).
- **Yarn Berry:** Use `yarn install --immutable` (not `--frozen-lockfile`). Pin via `.yarn/releases/`.

## Decisions log

- **Yarn linker:** `node-modules` (not PnP) — required for native/Next/Jest tooling.
- **Node floor:** 22.13+ for iron-session 9.
- **nanoid:** Stayed v3 — ESM v5 would need Jest transform changes; no functional need to bump.
- **Drizzle:** No version bump needed at migration time; pair already latest on npm.

## Verification (local, via Docker Compose Postgres/Redis)

See **[TESTING_STRATEGY.md § Running tests with Docker](./TESTING_STRATEGY.md#running-tests-with-docker)** for the full checklist, E2E options, and troubleshooting.

```bash
docker compose up -d postgres redis
yarn install --immutable
yarn migrate
yarn unit-test    # 150/150 — no Docker
yarn int-test     # 11/11 — Postgres
yarn api-test     # 53/53 — Postgres + Redis
yarn build
docker compose build app   # also runs unit-test + build in image
yarn playwright install chromium
yarn e2e-test     # app on :3000
```

Host-side tests load `.env` via `__tests__/loadEnv.js`, which rewrites docker-internal `DATABASE_URL` (`@db:` / `@postgres:`) and `REDIS_URL` (`redis://redis:`) to `localhost` published ports with compose credentials (`postgres:postgres`).
