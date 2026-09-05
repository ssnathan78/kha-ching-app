# Trading Lifecycle

How a signal becomes a closed trade, and what the application does when that
path is interrupted.

## 1. Happy path (intraday straddle / strangle)

```
Operator punches or weekday plan fires
        │
        ▼
job_executions row  (PENDING → QUEUE)
        │
        ▼
tradingQueue worker
        │
        ├─ Strike / skew / hedge decision
        │     └─ trading_decisions  (ENTER, risk PASSED|FAILED)
        │
        ├─ remoteOrderSuccessEnsurer
        │     ├─ orders PENDING → SUBMITTED (Kite placeOrder)
        │     ├─ ACCEPTED / PARTIALLY_FILLED / FILLED  + order_events
        │     └─ fills (incremental from Kite snapshot)
        │           └─ position_events → positions → open trades
        │
        ├─ exitTradingQueue  (per-leg SL)
        │     └─ orders purpose=SL, decision action=EXIT
        │
        ├─ targetPnLQueue    (points max-loss → squareOffTag)
        │
        └─ autoSquareOffQueue (time square-off)
              └─ MARKET exits, exit_reason on the trade
```

Chase is the same chain with `order_tag = chase`, product NRML, and decisions
from `generateSignal` / SL updates.

## 2. Concepts (do not collapse)

| Name | Meaning in this app |
|---|---|
| **Decision** | Strategy chose to enter, skip, exit, or move a stop. Not an order. |
| **Order** | Instruction we sent (or discovered) at Kite. |
| **Fill** | Quantity that actually traded. One order may have many fills. |
| **Position** | Signed exposure in one instrument for one job. |
| **Trade** | Round-trip: flat → open → flat (or still open). |
| **Portfolio** | Sum of attributed positions + last broker margin snapshot. |

One order ≠ one position ≠ one trade. A short straddle is typically **two**
positions and **two** trades under one job.

## 3. Order lifecycle

States: `PENDING`, `SUBMITTED`, `ACCEPTED`, `PARTIALLY_FILLED`, `FILLED`,
`CANCEL_REQUESTED`, `CANCELLED`, `REJECTED`, `EXPIRED`, `FAILED`, `UNKNOWN`.

Rules:

- A `REJECTED` or `FAILED` order must not create fills or exposure.
- Cancelling a `FILLED` order is a no-op on the ledger (the fill stays).
- Partial fills increase `filled_qty` and emit a new `fills` row; they do not
  rewrite the previous fill.
- After `placeOrder` acknowledgment we have a `broker_order_id`. If the
  process dies before the terminal poll, the order is `UNKNOWN` until
  reconciliation reads Kite.

Kite `TRIGGER PENDING` (SL working) maps to `ACCEPTED`.

## 4. Fill application (average-cost)

Signed quantity. Increasing the position refreshes VWAP. Reducing realizes
gross P&L against the current average. Reversal: close the remainder, then
open the leftover quantity at the new fill price as a new trade.

```
FLAT  --buy 50@100-->  LONG 50 @ 100     trade OPEN
      --buy 50@110-->  LONG 100 @ 105    same trade, INCREASED
      --sell 40@120--> LONG 60 @ 105     REDUCED, realize 40*(120-105)
      --sell 60@100--> FLAT              trade CLOSED, realize 60*(100-105)
```

Short is the mirror (sell opens, buy covers). Fees, when present, reduce
**net** P&L only. Mark-to-market never changes **realized** P&L.

Strategy **points** (`lib/pnl.ts`) remain a separate metric for target-PnL
exits. The ledger’s rupee P&L is the accounting record.

## 5. Exit reasons

Set on the closing trade / decision, not invented after the fact:

| Reason | Typical trigger |
|---|---|
| `STOP_LOSS` | Per-leg SL or Chase SL fill |
| `TAKE_PROFIT` | Target-PnL profit path (if enabled) |
| `TRAILING_STOP` | Trailing threshold exit |
| `RISK_LIMIT` | Max-loss points / kill-desk flatten |
| `STRATEGY` | Chase signal flip / planned exit |
| `MANUAL` | Operator stop on a job |
| `SHUTDOWN` | Auto square-off time / MIS close |
| `BROKER` | Exchange cancel / unexpected broker fill |
| `ROLLBACK` | Entry hedge/primary failure |
| `RECONCILED` | We learned the close from Kite after the fact |
| `MIGRATED` | Reconstructed from `transactions` |
| `UNKNOWN` | Close seen, cause not stored |

## 6. Failure and recovery

| Failure | Ledger state | Recovery |
|---|---|---|
| Network timeout after submit | `UNKNOWN` + audit | Reconcile by `broker_order_id` or tag+symbol+qty |
| Worker restart mid-entry | Job `QUEUE`/`COMPLETED`; orders as last written | Reconcile open/unknown orders; do **not** re-punch |
| Duplicate Kite notification | Same `fills.fingerprint` | Insert ignored |
| BullMQ retry of a job | New attempt may create a **new** idempotency key only if the previous order is terminal rejected | Intent key includes purpose+symbol+qty+tag |
| Broker outage | No new submits; existing rows unchanged | Reconcile when Kite returns |
| Crash after fill, before DB | Broker has the fill; we do not | Reconcile applies the fill once |

Idempotency keys and unique broker/fill ids are the recovery mechanism.
Re-running a worker must not open a second position.

## 7. Restart

On demand (`POST /api/desk/reconcile`) and at EOD ancillary sync:

1. Load non-terminal and `UNKNOWN` orders.
2. Fetch `kite.getOrders()` (and positions/margins).
3. Apply snapshots (status + incremental fills).
4. Compare aggregated internal qty vs Kite net.
5. Write `reconciliation_events` for mismatches.
6. Snapshot portfolio for drawdown.

In-memory worker state is never trusted after a crash.

## 8. Scenarios the tests encode

1. Simple trade: decision → order → fill → open → exit → close → P&L.
2. Partial fill: 40 then 60 → position 100.
3. Partial exit: 100 → 60 → 0 → trade closed.
4. Multiple entries: 50@100 + 50@110 → average 105.
5. Submit timeout → UNKNOWN → broker says filled → one fill, no duplicate order.
6. Open position + restart → reconcile restores qty.
7. Duplicate fill event → no second position/P&L change.
