# Trading Domain Model

This document is the product of the Phase 1 audit. It describes what Kha-Ching
**is**, what it **was missing**, and the entities we chose to persist.

Kha-Ching is a **personal single-account Indian index-options desk** on Zerodha
Kite. It is not a multi-account broker OMS. The model is sized to this app:

`signal → risk check → order → fill → position → trade → P&L → portfolio → audit`

## 1. What existed before this foundation

| Concept | Before | Where |
|---|---|---|
| Strategy templates | Yes | `trade_plans`, `strategy_defaults`, `chase_settings` |
| Strategy run / job | Partial | `job_executions` (config + BullMQ status + `order_tag`) |
| Signal / decision | No | Logs only (skew, ATM strike, Chase EMA) |
| Order | Transient | Live `kite.getOrders()`; EOD write-only `transactions` |
| Order events | No | — |
| Fill / execution | No | Implied by COMPLETE Kite orders (average price only) |
| Position | Transient | Live `kite.getPositions()` (UI used MIS only) |
| Position history | No | — |
| Trade / round trip | No | A “trade” in the UI meant a scheduled job |
| Portfolio / cash | No | Margin checked in-memory at punch time |
| Fees | No | Gross rupee P&L only (`lib/pnl.ts`) |
| P&L history | Partial | `job_executions.current_points`; live `/api/pnl` |
| Reconciliation | EOD archive | `transactions` never read back |
| Audit trail | Partial | Job row + Winston logs |
| Drawdown | No | — |

**Source of truth before:** Kite for orders/positions/P&L; Postgres for job
config; Redis for in-flight workers. A restart could not reconstruct *why* an
order was placed or *how* a position got to its current quantity.

`transactions` is **not** a trade table. It is an end-of-day copy of COMPLETE
Kite orders (one row per `order_id`). It has no partial fills, no rejected
orders, no positions, no fees, and no decision context.

A `job_executions` row with status `REJECT` or `FAILED` is **not** an order.
Desk → Orders is the blotter. Desk → Alerts (`/api/desk/alerts`) is the
operator log for schedule rejects, worker failures, risk blocks, and broker
errors that never created (or failed) a ledger order.

Desk → Signals (`strategy_signals`) is the persisted evaluation log: Chase
hourly EMA vs close (including wait), sampled straddle skew, strangle strike
selection. It is not an order. Clear today/before today/all deletes signal
rows. Alert clears hide rows via `operator_feed_clears` and do not delete the
ledger.

## 2. Entities we adopted

Chosen because they are required for a trustworthy lifecycle. Rejected entities
are listed in §4.

```
job_executions (existing Strategy Run)
        │
        ▼
trading_decisions          why we acted
        │
        ▼
orders ── order_events     instruction + immutable lifecycle
        │
        ▼
fills                      what the broker actually did
        │
        ▼
positions ── position_events
        │
        ▼
trades                     completed (or open) round-trip per instrument/job
        │
        ▼
fees / portfolio_snapshots / daily_sessions
        │
        ▼
reconciliation_events / audit_events
```

`trading_accounts` is a singleton (`id = default`) for the one Zerodha login.

### Ownership

| Entity | Owned by | External id |
|---|---|---|
| Trading account | Operator (one) | Kite `user_id` |
| Decision | Job + strategy | none (internal) |
| Order | Account + optional job/decision | Kite `order_id` |
| Fill | Order | Kite `trade_id` or deterministic fingerprint |
| Position | Account + instrument + product + **job** | none; reconciled to Kite net |
| Trade | Same key as position, one open at a time | none |
| Snapshot / session | Account + IST date | none |

### Strategy attribution

Jobs are the attribution unit. Every order is tagged (`order_tag` /
Chase `"chase"`). Positions are keyed

`(account, exchange, tradingsymbol, product, job_id)`

so two jobs on the same strike never share a position row. Broker
reconciliation **sums** internal quantities per
`(exchange, tradingsymbol, product)` and compares that to Kite `net`.

Unattributed broker activity (manual Kite order, unknown tag) is stored with
`job_id` null and `provenance = RECONCILED`.

## 3. Lifecycle and mutability

| Entity | Mutable? | Notes |
|---|---|---|
| `trading_decisions` | Immutable after insert | Later link `order_id` only |
| `orders` | Current status/qty/avg **materialized** | History in `order_events` |
| `order_events` | Immutable | Append-only |
| `fills` | Immutable | Duplicate fingerprint is a no-op |
| `positions` | Current state materialized | History in `position_events` |
| `position_events` | Immutable | Append-only |
| `trades` | Open trade updates; close is final | Do not rewrite a closed trade’s fills |
| `fees` | Immutable | |
| `portfolio_snapshots` | Immutable | |
| `daily_sessions` | Upserted totals for the IST day | Derived from events/snapshots |
| `audit_events` / `reconciliation_events` | Immutable; recon may mark resolved | |

### Order state machine

`PENDING → SUBMITTED → ACCEPTED → PARTIALLY_FILLED → FILLED`

Also: `CANCEL_REQUESTED`, `CANCELLED`, `REJECTED`, `EXPIRED`, `FAILED`,
`UNKNOWN`. Terminal states do not create new exposure. `UNKNOWN` is the
crash/timeout state and is resolved by reconciliation, never by guessing.

Kite statuses map in `lib/trading/kiteMap.ts` (OPEN / TRIGGER PENDING →
ACCEPTED, COMPLETE → FILLED, etc.).

### Position / trade state

Signed quantity: BUY `+qty`, SELL `−qty`. Average-cost accounting (not FIFO
lots). A position is `OPEN` when `quantity ≠ 0`, `FLAT` when `0`.

A **trade** opens when a flat book goes non-zero and closes when it returns to
zero. A reversal closes the current trade and opens a new one in the opposite
direction.

## 4. Entities we did not create

| Suggested | Why not a table |
|---|---|
| Instrument master | Kite instrument dump is SoT; symbols are denormalized onto orders/fills/positions |
| Strategy table | Already `job_execution_strategy` + `strategy_defaults` + `trade_plans` |
| Separate broker account | One Zerodha user; fields live on `trading_accounts` |
| Cash ledger (every debit/credit) | NSE F&O margin is not a simple cash wallet. Cash/margin is **snapshotted** from `kite.getMargins()`, not invented from fills |
| Tax lots / FIFO | Average-cost matches Kite `average_price` and this desk’s use |
| Funding / borrow / STT schedules | We do not invent brokerage. `fees` stores amounts only when known |
| Multi-currency books | INR only |

## 5. Source of truth

| Concern | External reality | Application record |
|---|---|---|
| Working orders / fills | Kite order book | `orders` + `fills` (operational + history) |
| Net position | Kite `getPositions().net` | `positions` (attributed) + recon events if they disagree |
| Margin / available cash | Kite `getMargins()` | `portfolio_snapshots` |
| Why we traded | (none at broker) | `trading_decisions` + `audit_events` |
| Job schedule | BullMQ | `job_executions` |

On disagreement, **do not silently overwrite history**. Record a
`reconciliation_event`, then apply broker facts as new events (fills, status
transitions). Internal state is derived from those events.

## 6. Time

- All timestamps stored as `timestamptz` (UTC).
- Trading session / “today” = calendar date in `Asia/Kolkata`.
- Distinguish `occurred_at` (event/broker time), `recorded_at` (we wrote the
  row), `submitted_at` / `filled_at` on orders.
- Never compare naive local strings.

## 7. Identifiers

| Id | Meaning |
|---|---|
| `orders.id` | Internal UUID |
| `orders.broker_order_id` | Kite `order_id` (unique when present) |
| `orders.idempotency_key` | Prevents duplicate submit on retry |
| `fills.fingerprint` | `kite-trade:{id}` or `kite-order:{id}:agg:{qty}:{px}` or `migrated-txn:{order_id}` |
| `trading_decisions.idempotency_key` | Same decision must not insert twice |
| `audit_events` unique `(event_type, idempotency_key)` | Worker/API retries |

## 8. Precision

Money uses `numeric(18,4)` in Postgres and integer scale-4 (`bigint`) in
`lib/trading/money.ts`. Quantity is an integer (lots × lot size). Do not use
IEEE floats for ledger math.

## 9. Existing tables that remain

- `job_executions` — strategy run / punch. Status still means “entry job
  lifecycle”, not “position closed”.
- `trade_plans` / `chase_settings` / `strategy_defaults` — configuration.
- `transactions` — legacy EOD archive. **Retained.** New ledger rows with
  `provenance = MIGRATED` are backfilled from it. Nothing is deleted.
- Chase `ema` / `chase_status` / `chase_log` — engine state. Decisions/orders
  from Chase are *also* written to the ledger.

See [TRADING_LIFECYCLE.md](./TRADING_LIFECYCLE.md),
[TRADING_DATA_MODEL.md](./TRADING_DATA_MODEL.md),
[TRADING_RECONCILIATION.md](./TRADING_RECONCILIATION.md).
