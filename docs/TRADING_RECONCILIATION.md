# Trading Reconciliation

The broker is external execution reality. The database is the operational and
historical record. Reconciliation makes those two views comparable without
destroying history.

## 1. What we compare

| Internal | Broker | Match key |
|---|---|---|
| `orders.broker_order_id` | `kite.getOrders()[].order_id` | Exact |
| Open/unknown orders without broker id | tag + symbol + qty + product + side + exchange | Best effort |
| Sum of `positions.quantity` | `kite.getPositions().net[].quantity` | exchange + tradingsymbol + product |
| `positions.average_entry_price` | Kite `average_price` | Same key; warn if material difference |
| Last `portfolio_snapshots` cash | `kite.getMargins().equity` | Snapshot, not a hard fail |

Manual Kite orders (no tag / unknown tag) become `provenance = RECONCILED`
rows so the books can still balance.

## 2. Process (`lib/trading/reconcile.ts`)

1. `ensureDefaultAccount()`.
2. Apply unapplied fills (crash recovery).
3. Backfill any `transactions` rows not yet in `orders` (idempotent).
4. Fetch Kite orders, positions, margins (when a session exists).
5. For each Kite order: `applyBrokerOrderSnapshot`.
6. For each internal open/unknown order missing from the Kite book: emit
   `MISSING_ORDER` (or mark cancelled/expired if the broker says so on a later
   day — we do **not** auto-cancel without evidence).
7. Aggregate internal positions vs Kite net → `POSITION_MISMATCH` /
   `AVG_PRICE` when they differ.
8. Unexpected Kite net with zero internal qty → `UNEXPECTED_ORDER` / create
   unattributed position via discovered fills if orders exist.
9. Write `portfolio_snapshots` and upsert `daily_sessions`.
10. Audit `RECONCILIATION_COMPLETED`.

Never place a new order as part of reconciliation.

## 3. Mismatch kinds

| Kind | Meaning |
|---|---|
| `POSITION_MISMATCH` | Aggregated qty ≠ broker qty |
| `AVG_PRICE` | Material average difference on the same book |
| `MISSING_ORDER` | We think an order is working; Kite does not have it |
| `UNEXPECTED_ORDER` | Kite has a working/filled order we never recorded |
| `FILL_MISMATCH` | Broker filled qty ≠ sum of our fills |
| `STALE_PENDING` | `PENDING`/`UNKNOWN` older than the stale threshold |
| `UNKNOWN_BROKER_ORDER` | Kite order we cannot attribute to a job |

## 4. Idempotency

- Reconcile may run after every EOD sync, on Desk → Reconcile, and in tests.
- `applyBrokerOrderSnapshot` and fill fingerprints make repeats safe.
- Audit/recon rows that are informational may insert every run; actionable
  duplicates use detail + open unresolved rows of the same kind/key.

## 5. Recovery playbook

| Symptom | Action |
|---|---|
| App crashed after `placeOrder` | Order `UNKNOWN` or `SUBMITTED`. Reconcile. If Kite COMPLETE, one fill is applied. Do not submit again. |
| App crashed after fill, before apply | Fill row exists with `applied_at` null. `applyUnappliedFills` books it once. |
| Duplicate webhook / queue retry | Unique fingerprint / idempotency key. |
| Internal short 65, Kite flat | `POSITION_MISMATCH`. Inspect fills vs Kite. Do not auto-flatten from the mismatch alone (kill-desk is explicit). |
| Kite short 65, internal flat | Discover orders by tag or create `RECONCILED` fills from the Kite COMPLETE orders, then apply. |

## 6. Mock orders

`MOCK_ORDERS=true` still writes ledger rows (intent + submitted). Broker
fetches are skipped. Reconciliation then only applies local unapplied fills
and historical `transactions`. This keeps the desk inspectable in local HTTP.
