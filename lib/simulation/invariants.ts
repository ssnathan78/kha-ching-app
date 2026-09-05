import { isSessionOpen } from "../marketCalendar"
import type { PortfolioBook } from "./book"
import type { SimulatedExchange } from "./broker"
import type { SimulatedMarket } from "./market"
import type { OutcomeAssertion, SimOrder, SimResult } from "./types"

export function collectInvariantViolations(args: {
  broker: SimulatedExchange
  book: PortfolioBook
  market: SimulatedMarket
  nowMs: number
  paperRisk: boolean
  allowOrdersWhenClosed: boolean
  halted: boolean
}): string[] {
  const v: string[] = []
  const { broker, book } = args

  const fillQtyByOrder = new Map<string, number>()
  for (const fill of broker.fills) {
    fillQtyByOrder.set(fill.orderId, (fillQtyByOrder.get(fill.orderId) ?? 0) + fill.quantity)
  }

  for (const order of broker.orders.values()) {
    const fillQty = fillQtyByOrder.get(order.orderId) ?? 0
    if (fillQty !== order.filledQty) {
      v.push(`fill qty mismatch ${order.orderId}: fills=${fillQty} order=${order.filledQty}`)
    }
    if (order.filledQty > order.quantity) {
      v.push(`overfill ${order.orderId}: ${order.filledQty} > ${order.quantity}`)
    }
    if (order.status === "REJECTED" && order.filledQty > 0) {
      v.push(`rejected order ${order.orderId} has fills`)
    }
    if (
      order.status === "REJECTED" &&
      book.qty(order.symbol) !== impliedQty(broker, order.symbol)
    ) {
      // checked globally below
    }
    if (!args.allowOrdersWhenClosed && !args.paperRisk && order.role === "ENTRY") {
      if (
        !isSessionOpen(order.createdAt, args.market.calendar.extraHolidays, args.market.calendar)
      ) {
        v.push(`entry ${order.orderId} created outside session`)
      }
    }
  }

  const fillIds = new Set<string>()
  for (const fill of broker.fills) {
    if (fillIds.has(fill.fillId)) v.push(`duplicate fill id ${fill.fillId}`)
    fillIds.add(fill.fillId)
  }

  const symbols = new Set([...book.positions.keys(), ...broker.fills.map(f => f.symbol)])
  for (const symbol of symbols) {
    const pos = book.positions.get(symbol)
    const implied = impliedQty(broker, symbol)
    const qty = pos?.quantity ?? 0
    if (implied !== qty) {
      v.push(`position ${symbol} qty ${qty} != signed fills ${implied}`)
    }
  }

  if (args.halted) {
    for (const order of broker.orders.values()) {
      if (order.role === "ENTRY" && order.status !== "REJECTED") {
        v.push(`halted desk still accepted entry ${order.orderId}`)
      }
    }
  }

  return v
}

function impliedQty(broker: SimulatedExchange, symbol: string): number {
  let q = 0
  for (const fill of broker.fills) {
    if (fill.symbol !== symbol) continue
    q += fill.side === "BUY" ? fill.quantity : -fill.quantity
  }
  return q
}

export function evaluateAssertions(
  result: Pick<SimResult, "orders" | "fills" | "positions" | "riskEvents" | "portfolio">,
  assertions: OutcomeAssertion[]
): SimResult["assertionResults"] {
  return assertions.map(assertion => {
    const { ok, message } = check(assertion, result)
    return { assertion, ok, message }
  })
}

function check(
  assertion: OutcomeAssertion,
  result: Pick<SimResult, "orders" | "fills" | "positions" | "riskEvents" | "portfolio">
): { ok: boolean; message: string } {
  switch (assertion.type) {
    case "no_orders":
      return yn(result.orders.length === 0, `orders=${result.orders.length}`)
    case "order_count": {
      const n = result.orders.filter(o => o.status !== "REJECTED").length
      const minOk = assertion.min == null || n >= assertion.min
      const maxOk = assertion.max == null || n <= assertion.max
      return yn(minOk && maxOk, `order_count=${n}`)
    }
    case "position_qty": {
      const pos = result.positions.find(p => p.symbol === assertion.symbol)
      const q = pos?.quantity ?? 0
      return yn(
        q === assertion.quantity,
        `${assertion.symbol} qty=${q} expected=${assertion.quantity}`
      )
    }
    case "no_position":
      return yn(
        result.positions.every(p => p.quantity === 0),
        `open=${result.positions
          .filter(p => p.quantity !== 0)
          .map(p => `${p.symbol}:${p.quantity}`)
          .join(",")}`
      )
    case "filled_qty": {
      const q = result.fills
        .filter(f => f.symbol === assertion.symbol)
        .reduce((s, f) => s + f.quantity, 0)
      return yn(q === assertion.quantity, `filled=${q} expected=${assertion.quantity}`)
    }
    case "max_exposure":
      return yn(
        Math.abs(result.portfolio.netQty) <= assertion.maxAbsQty,
        `netQty=${result.portfolio.netQty}`
      )
    case "no_duplicate_fill_qty": {
      const over = result.orders.filter(o => o.filledQty > o.quantity)
      return yn(over.length === 0, over.map(o => o.orderId).join(","))
    }
    case "risk_code_seen":
      return yn(
        result.riskEvents.some(e => e.code === assertion.code),
        `missing risk ${assertion.code}`
      )
    case "risk_code_absent":
      return yn(
        !result.riskEvents.some(e => e.code === assertion.code),
        `unexpected risk ${assertion.code}`
      )
    case "no_orders_outside_session": {
      const bad = result.orders.filter(o => o.role === "ENTRY" && !isSessionOpen(o.createdAt))
      return yn(bad.length === 0, bad.map(o => o.orderId).join(","))
    }
    case "closed_market_no_live_entries": {
      const bad = result.orders.filter(
        o => o.role === "ENTRY" && o.status !== "REJECTED" && !isSessionOpen(o.createdAt)
      )
      return yn(bad.length === 0, `live entries after close: ${bad.length}`)
    }
    case "halted_no_entries": {
      const entries = result.orders.filter(o => o.role === "ENTRY" && o.status !== "REJECTED")
      const halted = result.riskEvents.some(
        e =>
          e.code === "DESK_HALTED" ||
          e.code === "STRATEGY_HALTED" ||
          e.code === "DRAWDOWN" ||
          e.code === "DAILY_LOSS"
      )
      return yn(!halted || entries.length === 0, `entries after halt=${entries.length}`)
    }
    case "stale_data_no_order": {
      const staleBlocked = result.riskEvents.some(e => e.code === "STALE_DATA")
      return yn(
        staleBlocked || result.orders.length === 0,
        "stale data produced an unchecked order"
      )
    }
    case "recovered_qty": {
      const pos = result.positions.find(p => p.symbol === assertion.symbol)
      const q = pos?.quantity ?? 0
      return yn(q === assertion.quantity, `recovered ${q} expected ${assertion.quantity}`)
    }
    default:
      return { ok: false, message: `unknown assertion ${(assertion as SimOrder).orderId}` }
  }
}

function yn(ok: boolean, message: string) {
  return { ok, message }
}
