# Testing Strategy

Behavior-driven automated tests for kha-ching. Goal: catch bugs a real operator would hit, not maximize line coverage alone.

## Test pyramid

```mermaid
flowchart TB
  E2E["E2E Playwright ~20 journeys"]
  API["API contract ~50 cases"]
  INT["Integration Postgres/Redis ~15 cases"]
  SIM["Simulation catalog (clock + broker)"]
  UNIT["Unit hermetic ~60 cases"]
  E2E --> API --> INT --> SIM --> UNIT
```

| Layer | Location | Runs in CI | External deps |
|-------|----------|------------|---------------|
| Unit | `__tests__/unit/` (incl. `__tests__/unit/trading/` ledger math and `riskEngine.test.ts`) | Yes | None |
| Simulation | `__tests__/simulation/` + `lib/simulation/` | Yes (`yarn sim-test`) | None (injected clock, simulated exchange) |
| Integration | `__tests__/integration/` (incl. `tradingLedger.test.ts` lifecycles) | Yes (after migrate) | Postgres |
| API | `__tests__/api/` | Yes (after migrate) | Postgres, Redis |
| E2E | `__tests__/e2e/` | Yes (after build) | Postgres, Redis, Chromium |
| Live | `__tests__/live/` | No | Kite session (`USER_SESSION`) |

## Commands

```bash
yarn unit-test          # Hermetic logic
yarn sim-test           # Deterministic market simulation (no Kite)
yarn simulate -- --scenario flash-crash
yarn migrate            # Required before int/api
yarn int-test           # DB constraints, lifecycle
yarn api-test           # All API routes
yarn e2e-test           # Playwright (needs build + running stack)
yarn test:coverage      # Coverage summary
yarn live-test          # Optional Kite smoke (not CI)
yarn test               # unit + sim + int + api
```

## Running tests with Docker

Integration, API, and E2E tests need **Postgres 16** and **Redis 7**. The usual local setup is: **run only the data services in Docker**, run **Jest and Playwright on the host**. You do not need the app container running for int/api tests.

### 1. Start Postgres and Redis

From the repo root:

```powershell
# PowerShell / Windows
docker compose up -d postgres redis
```

```bash
# Linux / macOS
docker compose up -d postgres redis
```

Confirm they are healthy:

```powershell
docker compose ps
docker compose exec postgres pg_isready -U postgres -d trading_db
docker compose exec redis redis-cli ping
```

Compose publishes **5432** (Postgres) and **6379** (Redis) on `localhost`.

### 2. Install deps and apply schema (on the host)

Requires **Node ≥ 22.13** and Yarn Berry (`yarn install --immutable`).

```bash
yarn install --immutable
yarn migrate
```

### 3. Run the Jest suites

```bash
yarn lint
yarn unit-test          # no Docker needed
yarn int-test           # Postgres
yarn api-test           # Postgres + Redis
yarn test               # unit + int + api (same as CI minus lint/build/e2e)
```

**`.env` and Docker hostnames:** If your `.env` uses docker-internal URLs (`@db:`, `@postgres:`, or `redis://redis:`), that is fine for the **app container**. Host-side tests load `.env` via `__tests__/loadEnv.js`, which **rewrites** those hostnames to `localhost` / `127.0.0.1` with compose credentials (`postgres:postgres`). You do not need a separate test `.env` for the common compose layout.

If you use custom credentials or ports, set explicit URLs before running tests:

```powershell
# PowerShell — only if loadEnv defaults do not match your compose file
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/trading_db"
$env:REDIS_URL = "redis://127.0.0.1:6379"
yarn int-test
```

```bash
# bash
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/trading_db"
export REDIS_URL="redis://127.0.0.1:6379"
yarn api-test
```

Symptom: `getaddrinfo ENOTFOUND db` means Jest is still using a container hostname on the host — check `loadEnv.js` mapping or override `DATABASE_URL` as above.

### 4. Build and E2E (Playwright)

E2E needs a **production build** and a **running server** on port 3000, plus a **Chromium** binary.

**Option A — app already in Docker (simplest if you use `docker compose up`):**

```bash
yarn build                              # or rely on image from docker compose build
yarn playwright install chromium        # once per machine / after Playwright upgrade
yarn e2e-test                           # reuses http://127.0.0.1:3000 when not CI
```

`playwright.config.ts` runs `__tests__/e2e/globalSetup.ts` before tests to apply migrations against `DATABASE_URL` (defaults to local Postgres when unset).

With `docker compose up` (app container healthy on `:3000`), Playwright’s `reuseExistingServer` skips starting `yarn start`.

**Option B — app on the host:**

```bash
docker compose up -d postgres redis
yarn migrate
yarn build
yarn start                              # separate terminal; or background
yarn playwright install chromium
yarn e2e-test
```

**Option C — Playwright in Docker** (when the host cannot download browsers):

Start the app so it is reachable from containers (`docker compose up` or host `yarn start`). Then:

```powershell
# PowerShell — app on host.docker.internal:3000
docker run --rm `
  -v "${PWD}:/app" -w /app `
  -e PLAYWRIGHT_BASE_URL=http://host.docker.internal:3000 `
  -e CI=true `
  mcr.microsoft.com/playwright:v1.51.0-noble `
  bash -c "corepack enable && yarn install --immutable && yarn e2e-test"
```

```bash
# Linux — same network as compose app
docker run --rm \
  -v "$(pwd):/app" -w /app \
  --network host \
  -e PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 \
  -e CI=true \
  mcr.microsoft.com/playwright:v1.51.0-noble \
  bash -c "corepack enable && yarn install --immutable && yarn e2e-test"
```

Pin the Playwright image tag to match `@playwright/test` in `package.json` when upgrading.

### 5. Full local checklist (matches CI intent)

Run after code changes, before pushing:

```bash
docker compose up -d postgres redis
yarn install --immutable
yarn lint
yarn unit-test
yarn migrate
yarn int-test --runInBand --forceExit
yarn api-test --runInBand --forceExit
yarn build
yarn playwright install chromium
yarn e2e-test
```

### 6. Docker image build as an extra gate

The production Dockerfile **builder stage** runs `yarn unit-test` and `yarn build`. This catches hermetic and compile failures without local Postgres:

```bash
docker compose build app
```

That does **not** replace int/api/e2e — those still need Postgres/Redis as above.

### Quick reference

| Suite | Docker needed | Host needed |
|-------|---------------|-------------|
| `unit-test` | No | Node + Yarn |
| `int-test` | `postgres` | Node + Yarn + migrate |
| `api-test` | `postgres` + `redis` | Node + Yarn + migrate |
| `e2e-test` | `postgres` + `redis` + app on `:3000` | Node + Yarn + build + Playwright Chromium |
| `docker compose build app` | BuildKit only (runs unit-test in image) | Docker |

See also [DEVELOPMENT.md](./DEVELOPMENT.md) (mixed host/Docker dev) and [LOCAL.md](./LOCAL.md) (full Docker Desktop walkthrough).

## Shared infrastructure

| Module | Path | Purpose |
|--------|------|---------|
| Session factory | `__tests__/support/sessionFactory.ts` | Mock `KiteUser`, iron-session |
| API client | `__tests__/support/apiTestClient.ts` | Invoke handlers via node-mocks-http |
| DB helpers | `__tests__/support/dbHelpers.ts` | Pool, cleanup, `describeDb` skip |
| Redis helpers | `__tests__/support/redisHelpers.ts` | Ping, queue key cleanup |
| Kite mock | `__tests__/support/kiteMock.ts` | Shared KiteConnect mock |
| Job fixtures | `__tests__/support/jobFixtures.ts` | Valid straddle/strangle payloads |
| Playwright auth | `__tests__/support/playwrightAuth.ts` | Seal iron-session cookie for E2E |

## Mocking rules

| Layer | Mock? | Why |
|-------|-------|-----|
| Pure lib (pnl, ema, planMapper) | No | Deterministic |
| API handlers | Mock Kite; real DB/Redis | Auth + persistence |
| Queue processors | Mock Kite in unit; Redis in integration | Job routing |
| E2E | Mock `/api/user`; real app + DB | User-visible flows |
| Live Kite | Real `USER_SESSION` only | Manual smoke |

**Do not** mock business invariants (dual P&amp;L, plan uniqueness, points-based targets).

## Test data

- Fixtures in `jobFixtures.ts` — typed from `SUPPORTED_TRADE_CONFIG`
- Integration tests clean up by `order_tag` / plan `id`
- Use `describeDb` / `describe.skip` when `DATABASE_URL` unset
- Avoid test order dependencies

## E2E auth

Real Kite OAuth is not used in CI. Playwright:

1. Seals iron-session cookie via `playwrightAuth.ts`
2. Mocks `GET /api/user` (Kite profile validation skipped)
3. Server-side APIs still require valid session cookie

## CI pipeline

1. `yarn lint`
2. `yarn unit-test`
3. `yarn migrate`
4. `yarn int-test --runInBand --forceExit`
5. `yarn api-test --runInBand --forceExit`
6. `yarn build`
7. `npx playwright install --with-deps chromium`
8. `yarn e2e-test`

Services: Postgres 16, Redis 7. Env: `MOCK_ORDERS=true`, test Kite keys.

## Flakiness policy

- No `sleep()` for synchronization — use Playwright `expect` retries
- E2E: `workers: 1` in CI
- Integration: `--runInBand`
- Failing seed for property tests must be logged
- Zero tolerance for flaky tests on `main`

## Debugging failed tests

```bash
# Single file
yarn unit-test criticalPaths.test.ts

# API with verbose
yarn api-test --verbose plan.test.ts

# E2E headed
npx playwright test --headed --debug auth.spec.ts
```

## Priorities (P0 must never break)

- Dual P&amp;L separation
- Plan uniqueness
- Session/auth boundaries
- Job create/abort/delete
- Kill-desk scopes
- `MOCK_ORDERS` default in CI

See [TEST_COVERAGE.md](./TEST_COVERAGE.md) for the matrix and [TEST_DISCOVERED_BUGS.md](./TEST_DISCOVERED_BUGS.md) for known issues.
