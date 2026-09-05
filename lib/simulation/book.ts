import { applyFillToPosition, emptyPosition, type PositionState } from "../trading/accounting"
import { moneyFromNumber, moneyToNumber } from "../trading/money"
import type { Side } from "../trading/types"
import type { FillEvent, PositionSnapshot } from "./types"

export class PortfolioBook {
  positions = new Map<string, PositionState>()
  fills: FillEvent[] = []

  applyFill(fill: FillEvent): void {
    const current = this.positions.get(fill.symbol) ?? emptyPosition()
    const result = applyFillToPosition(current, {
      side: fill.side,
      quantity: fill.quantity,
      price: moneyFromNumber(fill.price),
      fee: moneyFromNumber(fill.fee),
      at: new Date(fill.at),
    })
    this.positions.set(fill.symbol, result.next)
    this.fills.push(fill)
  }

  qty(symbol: string): number {
    return this.positions.get(symbol)?.quantity ?? 0
  }

  snapshot(marks: Map<string, number>): PositionSnapshot[] {
    const out: PositionSnapshot[] = []
    for (const [symbol, pos] of this.positions) {
      const mark = marks.get(symbol) ?? moneyToNumber(pos.averagePrice)
      const avg = moneyToNumber(pos.averagePrice)
      const unrealized = pos.quantity === 0 ? 0 : (mark - avg) * pos.quantity
      out.push({
        symbol,
        quantity: pos.quantity,
        averagePrice: avg,
        realizedPnl: moneyToNumber(pos.realizedPnl),
        unrealizedPnl: unrealized,
        fees: moneyToNumber(pos.fees),
      })
    }
    return out
  }

  totals(marks: Map<string, number>) {
    const snaps = this.snapshot(marks)
    return snaps.reduce(
      (acc, p) => {
        acc.netQty += p.quantity
        acc.realizedPnl += p.realizedPnl
        acc.unrealizedPnl += p.unrealizedPnl
        acc.fees += p.fees
        acc.exposure += Math.abs(p.quantity * (marks.get(p.symbol) ?? p.averagePrice))
        return acc
      },
      { netQty: 0, realizedPnl: 0, unrealizedPnl: 0, fees: 0, exposure: 0 }
    )
  }

  clone(): PortfolioBook {
    const next = new PortfolioBook()
    next.fills = this.fills.map(f => ({ ...f }))
    for (const [symbol, pos] of this.positions) {
      next.positions.set(symbol, { ...pos })
    }
    return next
  }

  static fromSnapshot(book: PortfolioBook): PortfolioBook {
    return book.clone()
  }
}

export function opposite(side: Side): Side {
  return side === "BUY" ? "SELL" : "BUY"
}
