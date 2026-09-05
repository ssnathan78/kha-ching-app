# Trading Data Model

Postgres schema for the trading ledger (`drizzle/0004_trading_ledger.sql`).
Existing tables (`job_executions`, `trade_plans`, `transactions`, Chase) are
unchanged.

## Accounting rules

1. **Quantity** is a signed integer. BUY adds, SELL subtracts.
2. **Average entry** is quantity-weighted. Reducing a position does not change
   remaining average. Reversal resets average to the leftover fill price.
3. **Gross realized P&L** = closed qty × (exit − average) for longs, or
   closed qty × (average − exit) for shorts.
4. **Net realized P&L** = gross − fees attributed to that close.
5. **Unrealized P&L** = open qty marked at last known LTP / broker last price.
   Changing the mark never changes realized P&L.
6. **Cost basis** = `abs(quantity) × average_entry_price`.
7. **Market value** = `quantity × mark` (signed).
8. **Gross exposure** = sum of `abs(quantity × mark)` across open positions.
9. **Net exposure** = sum of signed market values.
10. **Cash / buying power / SPAN** come from Kite margin snapshots, not from
    summing fills. F&O premium and margin are not a cash wallet.
11. Scale: `numeric(18,4)` INR. Application math: `lib/trading/money.ts`
    (integer × 10⁴).

## Tables

### `trading_accounts`

Singleton `id = default`. Stores broker user id when known.

### `trading_decisions`

Why we acted. `parameters` / `features` hold strike, skew, EMA, lots — enough
to reconstruct the decision without storing a market-data tape.
`idempotency_key` is unique.

### `orders`

Materialized current order. Unique `idempotency_key`. Unique
`broker_order_id` where not null. Check: `filled_qty >= 0`,
`requested_qty > 0`, `filled_qty <= requested_qty` (Kite does not support
overfill for our order types).

### `order_events`

Append-only status transitions. `from_status` may be null on create.

### `fills`

One execution. `quantity > 0`. Unique `fingerprint`. Optional
`broker_trade_id`. `applied_at` set when the fill has been booked to a
position (so a crash between insert and apply can resume).

### `positions`

Current book per `(account_id, exchange, tradingsymbol, product, job_id)`.
`job_id` null is stored as empty-string in the unique index
(`COALESCE(job_id, '')`).

### `position_events`

`OPENED`, `INCREASED`, `REDUCED`, `CLOSED`, `REVERSED`, `MARKED`.

### `trades`

One open trade per position. Closed trades are left as history. `exit_reason`
is required on close (may be `UNKNOWN` / `MIGRATED`).

### `fees`

Optional. Only populated when an amount is known (we do not invent brokerage,
STT, or GST). `fee_type`: `BROKERAGE`, `EXCHANGE`, `STT`, `GST`, `STAMP`,
`OTHER`.

### `portfolio_snapshots`

Point-in-time book + broker margins. Used for peak equity and drawdown.

### `daily_sessions`

One row per IST trading date. Win/loss stats are derived from **closed
trades** that day, not from marks.

### `reconciliation_events`

Detected disagreements with Kite. May be marked `resolved`.

### `audit_events`

Operational log: signal, risk, submit, fill, kill-desk, pause, mismatch.
Unique `(event_type, idempotency_key)` when a key is present.

## Constraints (integrity)

- FKs: decisions/orders/fills/positions → `trading_accounts`;
  orders.decision_id → decisions; fills.order_id → orders;
  optional `job_id` → `job_executions`.
- Unique broker order id, fill fingerprint, decision/order idempotency keys.
- Check constraints on sides, statuses, positive quantities, money scale.

## Migration of `transactions`

See `drizzle/0005_trading_history_backfill.sql` and
`lib/trading/migrateHistory.ts`.

| Source column | Maps to | Missing |
|---|---|---|
| `order_id` | `orders.broker_order_id`, fill fingerprint | Partial fills, rejects, cancels |
| `tag` | `order_tag`; job lookup | Tag may not match a job |
| `quantity`, `average_price`, side | One aggregated fill | Individual exchange trades |
| `order_timestamp` | `occurred_at` / `filled_at` | Broker vs app clock |
| — | fees, decisions, exit reason | Marked `UNKNOWN` / `MIGRATED` |

`transactions` rows are **never deleted**. Backfill is idempotent
(`ON CONFLICT DO NOTHING`). Positions are rebuilt by applying unapplied fills
in `occurred_at` order — not guessed in SQL.

If only one side of a round-trip exists, the position may remain `OPEN` with
`provenance` implied by migrated fills. That is honest, not fabricated.

## Query patterns

- Open orders: `orders.status IN (PENDING, SUBMITTED, ACCEPTED, PARTIALLY_FILLED, CANCEL_REQUESTED, UNKNOWN)`
- Open positions: `positions.quantity <> 0`
- Job blotter: `orders.job_id` / `order_tag`
- Reconstruct a trade: fills for the position between `trades.entry_at` and
  `exit_at`, plus `position_events`
- Strategy P&L: sum `trades.net_pnl` grouped by `strategy`
- Drawdown: `portfolio_snapshots.peak_equity` vs `portfolio_value`
