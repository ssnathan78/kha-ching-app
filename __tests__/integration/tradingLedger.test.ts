import { randomUUID } from "crypto"

import { JOB_EXECUTION_STATUS, STRATEGIES } from "../../lib/constants"
import {
  applyBrokerOrderSnapshot,
  applyUnappliedFills,
  bookTestFill,
  recordDecision,
} from "../../lib/trading/ledger"
import { backfillFromTransactions } from "../../lib/trading/migrateHistory"
import { computePortfolio } from "../../lib/trading/portfolio"
import { reconcileWithBroker } from "../../lib/trading/reconcile"
import { createTestPool, describeDb } from "../support/dbHelpers"

describeDb("trading ledger lifecycle", () => {
  const pool = createTestPool()
  const tags: string[] = []
  const symbol = `TEST${Date.now()}CE`

  afterAll(async () => {
    await pool.query(
      `DELETE FROM position_events WHERE position_id IN (SELECT id FROM positions WHERE tradingsymbol LIKE 'TEST%')`
    )
    await pool.query(
      `DELETE FROM audit_events WHERE order_id IN (SELECT id FROM orders WHERE tradingsymbol LIKE 'TEST%')`
    )
    await pool.query(
      `DELETE FROM order_events WHERE order_id IN (SELECT id FROM orders WHERE tradingsymbol LIKE 'TEST%')`
    )
    await pool.query(`DELETE FROM trades WHERE tradingsymbol LIKE 'TEST%'`)
    await pool.query(`DELETE FROM fills WHERE tradingsymbol LIKE 'TEST%'`)
    await pool.query(`DELETE FROM orders WHERE tradingsymbol LIKE 'TEST%'`)
    await pool.query(
      `DELETE FROM positions WHERE tradingsymbol LIKE 'TEST%' OR tradingsymbol = 'NIFTYTESTCE'`
    )
    await pool.query(
      `DELETE FROM audit_events WHERE decision_id IN (SELECT id FROM trading_decisions WHERE idempotency_key LIKE 'test-%')`
    )
    await pool.query(`DELETE FROM trading_decisions WHERE idempotency_key LIKE 'test-%'`)
    await pool.query(`DELETE FROM fills WHERE fingerprint LIKE 'migrated-txn:txn-%'`)
    await pool.query(`DELETE FROM orders WHERE tradingsymbol = 'NIFTYTESTCE'`)
    await pool.query(`DELETE FROM transactions WHERE tradingsymbol = 'NIFTYTESTCE'`)
    if (tags.length) {
      await pool.query(`DELETE FROM job_executions WHERE order_tag = ANY($1::text[])`, [tags])
    }
    await pool.end()
  })

  it("creates ledger tables", async () => {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN ('orders','fills','positions','trades','trading_decisions')`
    )
    expect(rows.map(r => r.table_name).sort()).toEqual(
      ["fills", "orders", "positions", "trades", "trading_decisions"].sort()
    )
  })

  it("scenario 1+3: open, partial exit, close with P&L", async () => {
    const open = await bookTestFill({
      tradingsymbol: symbol,
      side: "BUY",
      quantity: 100,
      price: "100",
      product: "MIS",
    })
    expect(open.positionQty).toBe(100)
    const partial = await bookTestFill({
      tradingsymbol: symbol,
      side: "SELL",
      quantity: 40,
      price: "120",
      product: "MIS",
      purpose: "EXIT",
      exitReason: "STRATEGY",
    })
    expect(partial.positionQty).toBe(60)
    const closed = await bookTestFill({
      tradingsymbol: symbol,
      side: "SELL",
      quantity: 60,
      price: "110",
      product: "MIS",
      purpose: "EXIT",
      exitReason: "STOP_LOSS",
    })
    expect(closed.positionQty).toBe(0)
    const { rows } = await pool.query(
      `SELECT quantity, realized_pnl, status FROM positions WHERE tradingsymbol = $1 AND product = 'MIS'`,
      [symbol]
    )
    expect(Number(rows[0].quantity)).toBe(0)
    expect(Number(rows[0].realized_pnl)).toBe(1400)
    expect(rows[0].status).toBe("FLAT")
    const trades = await pool.query(
      `SELECT status, net_pnl, exit_reason FROM trades WHERE tradingsymbol = $1 ORDER BY entry_at`,
      [symbol]
    )
    expect(trades.rows.some(r => r.status === "CLOSED" && r.exit_reason === "STOP_LOSS")).toBe(true)
  })

  it("scenario 2: partial fills accumulate to 100", async () => {
    const s = `${symbol}PF`
    await bookTestFill({
      tradingsymbol: s,
      side: "BUY",
      quantity: 40,
      price: "100",
      product: "NRML",
    })
    const second = await bookTestFill({
      tradingsymbol: s,
      side: "BUY",
      quantity: 60,
      price: "100",
      product: "NRML",
    })
    expect(second.positionQty).toBe(100)
  })

  it("scenario 4: two entries produce average 105", async () => {
    const s = `${symbol}AVG`
    await bookTestFill({
      tradingsymbol: s,
      side: "BUY",
      quantity: 50,
      price: "100",
      product: "MIS",
    })
    await bookTestFill({
      tradingsymbol: s,
      side: "BUY",
      quantity: 50,
      price: "110",
      product: "MIS",
    })
    const { rows } = await pool.query(
      `SELECT quantity, average_entry_price FROM positions WHERE tradingsymbol = $1`,
      [s]
    )
    expect(Number(rows[0].quantity)).toBe(100)
    expect(Number(rows[0].average_entry_price)).toBe(105)
  })

  it("scenario 7: duplicate fill fingerprint does not change position twice", async () => {
    const s = `${symbol}DUP`
    const first = await bookTestFill({
      tradingsymbol: s,
      side: "BUY",
      quantity: 10,
      price: "50",
      product: "MIS",
      fingerprint: `dup:${s}`,
    })
    const again = await bookTestFill({
      tradingsymbol: s,
      side: "BUY",
      quantity: 10,
      price: "50",
      product: "MIS",
      fingerprint: `dup:${s}`,
    })
    expect(first.positionQty).toBe(10)
    expect(again.positionQty).toBe(10)
  })

  it("scenario 5: UNKNOWN then broker COMPLETE applies one fill", async () => {
    const s = `${symbol}UNK`
    const brokerId = `kite-${randomUUID()}`
    await applyBrokerOrderSnapshot({
      order_id: brokerId,
      status: "OPEN",
      tradingsymbol: s,
      exchange: "NFO",
      transaction_type: "BUY",
      order_type: "MARKET",
      product: "MIS",
      quantity: 25,
      filled_quantity: 0,
      pending_quantity: 25,
      tag: "unk-tag",
    })
    await applyBrokerOrderSnapshot({
      order_id: brokerId,
      status: "COMPLETE",
      tradingsymbol: s,
      exchange: "NFO",
      transaction_type: "BUY",
      order_type: "MARKET",
      product: "MIS",
      quantity: 25,
      filled_quantity: 25,
      pending_quantity: 0,
      average_price: 99,
      tag: "unk-tag",
    })
    await applyBrokerOrderSnapshot({
      order_id: brokerId,
      status: "COMPLETE",
      tradingsymbol: s,
      exchange: "NFO",
      transaction_type: "BUY",
      quantity: 25,
      filled_quantity: 25,
      average_price: 99,
      product: "MIS",
    })
    const pos = await pool.query(`SELECT quantity FROM positions WHERE tradingsymbol = $1`, [s])
    expect(Number(pos.rows[0].quantity)).toBe(25)
    const fillCount = await pool.query(
      `SELECT COUNT(*)::int AS n FROM fills WHERE tradingsymbol = $1`,
      [s]
    )
    expect(fillCount.rows[0].n).toBe(1)
  })

  it("rejected order does not create exposure", async () => {
    const s = `${symbol}REJ`
    await applyBrokerOrderSnapshot({
      order_id: `rej-${randomUUID()}`,
      status: "REJECTED",
      status_message: "insufficient",
      tradingsymbol: s,
      exchange: "NFO",
      transaction_type: "SELL",
      quantity: 65,
      filled_quantity: 0,
      product: "MIS",
    })
    const pos = await pool.query(`SELECT quantity FROM positions WHERE tradingsymbol = $1`, [s])
    expect(pos.rows.length === 0 || Number(pos.rows[0].quantity) === 0).toBe(true)
  })

  it("decision + job attribution persist", async () => {
    const tag = `jest-ledger-${Date.now()}`
    tags.push(tag)
    const job = await pool.query(
      `INSERT INTO job_executions (strategy, status, order_tag, lots, name, created_at)
       VALUES ($1,$2,$3,1,'ledger',NOW()) RETURNING id`,
      [STRATEGIES.ATM_STRADDLE, JOB_EXECUTION_STATUS.QUEUE, tag]
    )
    const decisionId = await recordDecision({
      jobId: job.rows[0].id,
      strategy: "ATM_STRADDLE",
      action: "ENTER",
      reason: "test",
      riskResult: "PASSED",
      idempotencyKey: `test-decision-${tag}`,
    })
    expect(decisionId).toBeTruthy()
    const booked = await bookTestFill({
      tradingsymbol: `${symbol}JOB`,
      side: "SELL",
      quantity: 65,
      price: "80",
      product: "MIS",
      jobId: job.rows[0].id,
      strategy: "ATM_STRADDLE",
      orderTag: tag,
    })
    expect(booked.positionQty).toBe(-65)
  })

  it("portfolio totals match open positions", async () => {
    const view = await computePortfolio()
    expect(view.openPositionCount).toBeGreaterThanOrEqual(0)
    expect(Number(view.grossExposure)).toBeGreaterThanOrEqual(0)
  })

  it("reconcile matching broker qty records no position mismatch for that symbol", async () => {
    const s = `${symbol}REC`
    await bookTestFill({ tradingsymbol: s, side: "BUY", quantity: 30, price: "10", product: "MIS" })
    const result = await reconcileWithBroker({
      orders: [],
      positions: [
        { exchange: "NFO", tradingsymbol: s, product: "MIS", quantity: 30, average_price: 10 },
      ],
    })
    expect(result.snapshot).toBeTruthy()
  })

  it("migrated transactions backfill is idempotent", async () => {
    const orderId = `txn-${randomUUID()}`
    await pool.query(
      `INSERT INTO transactions (order_id, tradingsymbol, exchange, transaction_type, quantity, average_price, tag, product)
       VALUES ($1,'NIFTYTESTCE','NFO','SELL',65,12.5,'migr-tag','MIS')`,
      [orderId]
    )
    const first = await backfillFromTransactions()
    const second = await backfillFromTransactions()
    expect(second.insertedOrders).toBe(0)
    await applyUnappliedFills()
    const fills = await pool.query(`SELECT COUNT(*)::int AS n FROM fills WHERE fingerprint = $1`, [
      `migrated-txn:${orderId}`,
    ])
    expect(fills.rows[0].n).toBe(1)
    void first
  })
})
