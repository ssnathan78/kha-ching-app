# Security findings

Tracked findings from the security hardening pass. Threat model: [SECURITY_REVIEW.md](SECURITY_REVIEW.md).

| ID | Severity | Location | Risk | Remediation | Status |
|----|----------|----------|------|-------------|--------|
| SEC-01 | Critical | `scripts/bull-board.js` | Unauthenticated Bull Board on port 3001 | Session middleware + `127.0.0.1` bind; block production unless `BULL_BOARD_STANDALONE=true` | **Fixed** |
| SEC-02 | High | `pages/api/trades_day.ts` POST | Mass assignment via `...req.body` | `lib/jobExecutionMapper.ts` allowlist | **Fixed** |
| SEC-03 | High | `pages/api/delete_job` | Remove any BullMQ job ID | Require linked `job_executions` row for today; migrated to TS | **Fixed** |
| SEC-04 | High | Multiple API routes | Raw error objects to clients | `lib/apiErrors.ts` `sendApiError` / `safeErrorMessage` | **Fixed** |
| SEC-05 | High | `pages/api/redirect_url_kite.ts` | Any Zerodha account can log in | `lib/authPolicy.ts` `ALLOWED_KITE_USER_ID` (required in production) | **Fixed** |
| SEC-06 | High | Session payload | Unused `refresh_token` in cookie | Removed from `slimSession()` | **Fixed** |
| SEC-07 | Medium | `pages/api/trades_day.ts` PUT | Arbitrary `status` / `userOverride` | ABORT-only via `abortJobExecution`; reject `status` | **Fixed** |
| SEC-08 | Medium | Chase / strategy defaults APIs | Weak validation | `lib/chaseValidation.ts`; `validatePlanConfig` on strategy-defaults PUT | **Fixed** |
| SEC-09 | Medium | OAuth / destructive APIs | No rate limiting | `lib/rateLimit.js` on sensitive paths in `server.js` | **Fixed** |
| SEC-10 | Medium | HTTP responses | Missing CSP / HSTS | `next.config.js` production-aware headers | **Fixed** |
| SEC-11 | Medium | `pages/api/health.ts` | Unauthenticated infra disclosure | Optional `HEALTH_CHECK_TOKEN` bearer / `x-health-token` | **Fixed** |
| SEC-12 | Medium | `pages/api/trades_day.ts` logging | Full body may log secrets | Allowlisted fields in `logJobSchedule` | **Fixed** |
| SEC-13 | Low | Logout APIs | Any HTTP method | POST-only on `/api/logout` and `/api/revoke_session` | **Fixed** |
| SEC-14 | Low | CI | No dependency audit | `yarn npm audit` in `.github/workflows/ci.yml` | **Fixed** |
| SEC-15 | Info | Docker Compose | Postgres/Redis on host ports | Documented in [DEPLOYMENT.md](DEPLOYMENT.md) | **Documented** |

## Accepted by design

- **Multi-user IDOR** — single-operator app; mitigated by SEC-05 + network placement
- **File upload/download** — no routes
- **SSRF** — no user-controlled outbound URLs
- **SQL injection** — Drizzle parameterization
- **XSS** — React text escaping; no `dangerouslySetInnerHTML`

## Tests

- `__tests__/api/security.test.ts` — mass assignment, delete_job 404, PUT lockdown, Chase caps, health token, auth allowlist
- `__tests__/unit/strategyValidation.test.ts` — `validateStrategyEnum`

## Environment variables

See `.env.example`:

- `ALLOWED_KITE_USER_ID` — production OAuth allowlist
- `HEALTH_CHECK_TOKEN` — optional health endpoint protection
- `SESSION_COOKIE_SECURE` — cookie transport security
