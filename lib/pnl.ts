/**
 * Dual trading metrics (intentional):
 * - Rupee P&L: quantity × average price (gross, no brokerage/taxes).
 * - Strategy points: signed fill prices per symbol (unweighted by lots).
 *   Max profit/loss square-off continues to use points, not rupees.
 */

export type PnlFill = {
  tradingsymbol?: string
  transaction_type?: string
  quantity?: number
  average_price?: number
}

export type SymbolPoints = {
  tradingsymbol: string
  quantity: number
  points: number
}

/** Gross rupee P&L: sum(sell qty×px) − sum(buy qty×px). */
export function rupeePnl(orders: PnlFill[]): number {
  let buyTotal = 0
  let sellTotal = 0
  for (const order of orders) {
    const value = (order.quantity || 0) * (order.average_price || 0)
    if (order.transaction_type === "BUY") {
      buyTotal += value
    } else if (order.transaction_type === "SELL") {
      sellTotal += value
    }
  }
  return sellTotal - buyTotal
}

/**
 * Aggregate completed fills by tradingsymbol using signed prices (not qty×price).
 * SELL adds +average_price and −quantity; BUY adds −average_price and +quantity.
 */
export function aggregateFillsBySymbol(orders: PnlFill[]): SymbolPoints[] {
  const pending: Record<string, { points: number; quantity: number }> = {}

  for (const curr of orders) {
    const symbol = curr.tradingsymbol || ""
    const avg = curr.average_price || 0
    const qty = curr.quantity || 0
    if (!pending[symbol]) {
      pending[symbol] = {
        points: curr.transaction_type === "SELL" ? avg : -1 * avg,
        quantity: curr.transaction_type === "SELL" ? -1 * qty : qty,
      }
    } else {
      pending[symbol].points += curr.transaction_type === "SELL" ? avg : -1 * avg
      pending[symbol].quantity += curr.transaction_type === "SELL" ? -1 * qty : qty
    }
  }

  return Object.keys(pending).map(key => ({
    tradingsymbol: key,
    quantity: pending[key].quantity,
    points: pending[key].points,
  }))
}

/** Sum of per-symbol strategy points from fills (no live LTP adjustment). */
export function strategyPointsFromFills(orders: PnlFill[]): number {
  return aggregateFillsBySymbol(orders).reduce((sum, row) => sum + row.points, 0)
}

export function orderQuantity(lots: number, lotSize: number): number {
  return lotSize * lots
}
