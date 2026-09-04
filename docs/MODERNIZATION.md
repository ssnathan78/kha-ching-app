# Kha-Ching modernization report

Independent personal trading app (`ssnathan78/kha-ching-app`). Droplet stays the production host.

## Executive summary

Hardened the existing Next.js + Postgres + Redis + BullMQ monolith: secrets out of the UI, dual P&L metrics, unique order IDs, safer login/queues, iron-session, tests, CI, and docs. No rewrite.

## Completed (by backlog)

| ID | Status |
|---|---|
| KHA-001–007 | Done: token redaction, unique `order_id`, stop deleting job history, backup scripts |
| KHA-008–010 | Done: `lib/pnl.ts` rupees + points; strangle live lot size; unit tests |
| KHA-011–014 | Done: health Postgres+Redis, IST today query, no queue obliterate on login, axios 1.7, iron-session |
| KHA-015–023 | Done: fork branding/footer/support removed; Compose `local` profile; systemd; CI |
| KHA-024 | This document |

## Intentional behavior

- **Points** (max profit/loss): unchanged (signed prices, not qty×price).
- **Rupee P&L**: `qty × price` on `/api/pnl` and dashboard.
- Login no longer `obliterate`s Redis queues.

## Breaking

- `/api/user` no longer returns `access_token` / full session. Use `user_id`, `user_name`, `email`, `avatar_url`.
- `/api/get_job` no longer returns Bull job `data.user`.
- Cookie library change: re-login once.
- Fork UI (footer, subscription, upstream GitHub poll) removed.

## MANUAL PRODUCTION ACTION REQUIRED

See `docs/DEPLOYMENT.md`: snapshot, `pg_dump`, `yarn migrate` or apply `drizzle/0000_integrity.sql`, systemd, TLS, firewall, Node 20.

## Tests / build

Unit tests: `__tests__/unit/pnl.test.ts`, `slOrders.test.ts`. CI uses Node 20 (`yarn unit-test`, `yarn lint`, `yarn build`). This workstation had Node 14, so Next/Jest could not be executed locally.

## Remaining

- Confirm unique-index migration on existing `transactions` duplicates.
- Restore-drill a backup on a copy of the DB.
- Optional: split workers to a second process (not needed at this scale).
