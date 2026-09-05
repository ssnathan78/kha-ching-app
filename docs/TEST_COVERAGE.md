# Test Coverage Matrix

Last updated: Phase 2 — high-risk gaps, bug fixes, strategy test expansion.

## Summary

| Metric | Count |
|--------|-------|
| Unit test cases | **150** (25 suites) |
| API contract tests | 53 cases (10 suites; DB-backed tests need Postgres) |
| Integration tests | 11 cases (Postgres + migrations) |
| P0 E2E journeys | 7 Playwright specs |

## Feature matrix

| Feature | Unit | Integration | API | Priority | Status |
|---------|------|-------------|-----|----------|--------|
| Schedule validation | strategyValidation | — | trades_day | P0 | **Covered** |
| ATM straddle | atmStraddle, skewMath | — | trades_day | P0 | **Covered** |
| ATM strangle | strangle, strangleStrikes | — | trades_day | P0 | **Covered** |
| Chase signal | chaseSignal | — | — | P1 | **Covered** |
| Target P&amp;L points | targetPnL | — | — | P0 | **Covered** |
| Exit SL / processExitJob | slOrders, processExitJob | — | — | P1 | **Covered** |
| Queue routing | tradingJobProcessor, staleJobGuard | — | — | P0 | **Covered** |
| Watchers | slmWatcher, sllWatcher | — | — | P2 | **Covered** |
| Kill desk | killDesk | — | kill-desk | P0 | Unit + API |
| Weekday plans | planMapper | ✓ uniqueness | ✓ plan | P0 | Covered |
| Unimplemented exit enums | strategyValidation | — | trades_day 400 | P0 | **Fixed BUG-001** |

## Remaining gaps (lower priority)

1. **RTL component tests** — trade setup forms (jsdom not wired)
2. **Full BullMQ worker E2E** — processTradingJob unit-tested; live Redis worker loop not automated
3. **Premium threshold exit** — removed from schedule surface; not implemented in processor by design
4. **Local API/int tests** — use Docker Postgres/Redis; see [TESTING_STRATEGY.md § Running tests with Docker](./TESTING_STRATEGY.md#running-tests-with-docker)

## Test commands

```bash
docker compose up -d postgres redis   # deps for int/api/e2e
yarn migrate
yarn unit-test    # 150 hermetic tests — no Docker
yarn int-test     # Postgres
yarn api-test     # Postgres + Redis
yarn e2e-test     # Playwright + app on :3000
```

Full Docker + host workflow: [TESTING_STRATEGY.md](./TESTING_STRATEGY.md#running-tests-with-docker).

## Bug regression map

See [TEST_DISCOVERED_BUGS.md](./TEST_DISCOVERED_BUGS.md) — BUG-001 through BUG-005 marked fixed with regression tests.
