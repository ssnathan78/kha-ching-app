# Test-Discovered Bugs

Living log of issues found while building/running the test suite. Regression tests reference file names.

| ID | Severity | Feature | Description | Status | Regression Test |
|----|----------|---------|-------------|--------|-------------------|
| BUG-001 | Medium | Exit strategies | UI listed unimplemented exit enums; queue only ran `INDIVIDUAL_LEG_SLM_1X` | **Fixed** — schedule-time validation; form shows only `INDIVIDUAL_LEG_SLM_1X` / `NO_SL`; saved plans coerce | `strategyValidation.test.ts`, `processExitJob.test.ts` |
| BUG-002 | Low | trades_day | `runNow` market-open validation was commented out | **Fixed** — guard re-enabled | `trades_day.test.ts` |
| BUG-003 | Low | Strangle UI | FinNifty listed on form but strategy rejects it | **Fixed** — form defaults to Nifty/BankNifty only | `strategyValidation.test.ts`, strangle form |
| BUG-004 | Info | Live tests | Broken `optionSellerStrategy.test.js` | **Removed** | N/A |
| BUG-005 | Low | order_history API | Missing `id` query called Kite with undefined | **Fixed** — returns 400 | `broker.test.ts` |

## Fixes shipped

| Area | Change |
|------|--------|
| BUG-001 | `lib/strategyValidation.ts` rejects unimplemented exits; `SlManagerComponent` hides Combined/Supertrend/OBS; `hydratePlanConfig` coerces saved plans |
| BUG-002 | `pages/api/trades_day.ts` — `isMarketOpen()` enforced when `MOCK_ORDERS=false` |
| BUG-003 | `components/trades/atmStrangle/TradeSetupForm.tsx` — Nifty/BankNifty only |
| BUG-005 | `pages/api/order_history.js` — 400 without `id`, 405 for non-GET |
| Infra | Node upgraded to v20+ (local v26); `__tests__/unitMocks.js` + `apiMocks.js` for hermetic Jest |
| Queue | `tradingJobProcessor.ts` / `staleJobGuard.ts` extracted for testable routing |

Add new rows when tests expose regressions. Do not weaken assertions to hide failures.
