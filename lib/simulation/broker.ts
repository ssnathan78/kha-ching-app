import type { OrderRole } from "../trading/riskEngine"
import type { OrderStatus, Side } from "../trading/types"
import { assertNotLiveKite, assertSimulationSafe } from "./isolation"
import type { SimulatedMarket } from "./market"
import { roundPx } from "./pricePath"
import type { FillEvent, SimOrder, SimOrderType, SlippageSpec } from "./types"

export class SimulatedBrokerError extends Error {
  code: string
  status?: number
  constructor(code: string, message: string, status?: number) {
    super(message)
    this.name = "SimulatedBrokerError"
    this.code = code
    this.status = status
  }
}

export type PlaceOrderInput = {
  symbol: string
  side: Side
  quantity: number
  orderType?: SimOrderType
  product?: string
  price?: number | null
  triggerPrice?: number | null
  tag?: string | null
  role?: OrderRole
  strategy?: string | null
  clientKey?: string
}

export type BrokerFaults = {
  unavailable: boolean
  timeout: boolean
  http500: boolean
  rateLimit: boolean
  connectionReset: boolean
  auth: boolean
  delayedResponse: boolean
  unknownStatus: boolean
  duplicateResponse: boolean
  incorrectResponse: boolean
  lostAccept: boolean
  rejectAll: boolean
  delayTicks: number
  expireOnClose: boolean
}

export const CLEAR_FAULTS = (): BrokerFaults => ({
  unavailable: false,
  timeout: false,
  http500: false,
  rateLimit: false,
  connectionReset: false,
  auth: false,
  delayedResponse: false,
  unknownStatus: false,
  duplicateResponse: false,
  incorrectResponse: false,
  lostAccept: false,
  rejectAll: false,
  delayTicks: 0,
  expireOnClose: false,
})

export class SimulatedExchange {
  orders = new Map<string, SimOrder>()
  fills: FillEvent[] = []
  faults = CLEAR_FAULTS()
  seq = 1
  fillSeq = 1
  feeBps: number
  slippage: SlippageSpec
  rng: () => number
  lastDuplicate: SimOrder | null = null

  constructor(args: { feeBps?: number; slippage?: SlippageSpec; rng: () => number }) {
    assertSimulationSafe("SimulatedExchange")
    this.feeBps = args.feeBps ?? 0
    this.slippage = args.slippage ?? { mode: "zero" }
    this.rng = args.rng
  }

  resetFaults(): void {
    this.faults = CLEAR_FAULTS()
  }

  placeOrder(input: PlaceOrderInput, market: SimulatedMarket, nowMs: number): SimOrder {
    assertSimulationSafe("placeOrder")
    assertNotLiveKite(input)

    this.throwIfFault()

    if (this.faults.rejectAll) {
      return this.reject(input, nowMs, "SIM_REJECT")
    }

    const clientKey =
      input.clientKey ||
      `${input.tag || "untagged"}:${input.symbol}:${input.side}:${input.quantity}:${input.orderType || "MARKET"}`

    const existing = [...this.orders.values()].find(o => o.clientKey === clientKey)
    if (existing) {
      this.lastDuplicate = existing
      return existing
    }

    const order: SimOrder = {
      orderId: `sim:${this.seq++}`,
      clientKey,
      symbol: input.symbol,
      side: input.side,
      quantity: input.quantity,
      filledQty: 0,
      orderType: input.orderType ?? "MARKET",
      product: input.product ?? "NRML",
      price: input.price ?? null,
      triggerPrice: input.triggerPrice ?? null,
      status: this.faults.unknownStatus ? "UNKNOWN" : "ACCEPTED",
      tag: input.tag ?? null,
      role: input.role ?? "ENTRY",
      strategy: input.strategy ?? null,
      createdAt: nowMs,
      updatedAt: nowMs,
      fills: [],
      delayTicksRemaining: this.faults.delayTicks,
    }
    this.orders.set(order.orderId, order)

    if (this.faults.lostAccept) {
      throw new SimulatedBrokerError(
        "LOST_RESPONSE",
        "Order may have been accepted; response was lost"
      )
    }
    if (this.faults.delayedResponse) {
      // still recorded; caller sees timeout after accept
      throw new SimulatedBrokerError("TIMEOUT", "Broker timed out after accept", 504)
    }
    if (this.faults.duplicateResponse) {
      this.lastDuplicate = { ...order }
    }

    this.matchOrder(order, market, nowMs)
    return this.faults.incorrectResponse ? { ...order, status: "UNKNOWN", filledQty: 0 } : order
  }

  cancel(orderId: string, nowMs: number): SimOrder | undefined {
    const order = this.orders.get(orderId)
    if (!order || isTerminal(order.status)) return order
    order.status = "CANCELLED"
    order.updatedAt = nowMs
    return order
  }

  expireWorking(nowMs: number): void {
    for (const order of this.orders.values()) {
      if (!isTerminal(order.status)) {
        order.status = "EXPIRED"
        order.updatedAt = nowMs
      }
    }
  }

  step(market: SimulatedMarket, nowMs: number, sessionOpen: boolean): FillEvent[] {
    const created: FillEvent[] = []
    if (this.faults.expireOnClose && !sessionOpen) {
      this.expireWorking(nowMs)
      return created
    }
    for (const order of this.orders.values()) {
      if (isTerminal(order.status) || order.status === "UNKNOWN") continue
      if (order.delayTicksRemaining > 0) {
        order.delayTicksRemaining -= 1
        continue
      }
      const before = order.filledQty
      this.matchOrder(order, market, nowMs)
      if (order.filledQty > before) {
        created.push(...order.fills.filter(f => f.at === nowMs))
      }
    }
    return created
  }

  snapshot(): { orders: SimOrder[]; fills: FillEvent[]; seq: number; fillSeq: number } {
    return {
      orders: [...this.orders.values()].map(cloneOrder),
      fills: this.fills.map(f => ({ ...f })),
      seq: this.seq,
      fillSeq: this.fillSeq,
    }
  }

  restore(snap: { orders: SimOrder[]; fills: FillEvent[]; seq: number; fillSeq: number }): void {
    this.orders.clear()
    for (const o of snap.orders) this.orders.set(o.orderId, cloneOrder(o))
    this.fills = snap.fills.map(f => ({ ...f }))
    this.seq = snap.seq
    this.fillSeq = snap.fillSeq
  }

  private throwIfFault(): void {
    if (this.faults.unavailable) {
      throw new SimulatedBrokerError("UNAVAILABLE", "Broker unavailable", 503)
    }
    if (this.faults.timeout) {
      throw new SimulatedBrokerError("TIMEOUT", "Broker API timeout", 504)
    }
    if (this.faults.http500) {
      throw new SimulatedBrokerError("HTTP_500", "Internal broker error", 500)
    }
    if (this.faults.rateLimit) {
      throw new SimulatedBrokerError("RATE_LIMIT", "Too many requests", 429)
    }
    if (this.faults.connectionReset) {
      throw new SimulatedBrokerError("CONNECTION_RESET", "Connection reset")
    }
    if (this.faults.auth) {
      throw new SimulatedBrokerError("AUTH", "Authentication failed", 403)
    }
  }

  private reject(input: PlaceOrderInput, nowMs: number, reason: string): SimOrder {
    const order: SimOrder = {
      orderId: `sim:${this.seq++}`,
      clientKey: input.clientKey || `rej:${this.seq}`,
      symbol: input.symbol,
      side: input.side,
      quantity: input.quantity,
      filledQty: 0,
      orderType: input.orderType ?? "MARKET",
      product: input.product ?? "NRML",
      price: input.price ?? null,
      triggerPrice: input.triggerPrice ?? null,
      status: "REJECTED",
      tag: input.tag ?? null,
      role: input.role ?? "ENTRY",
      strategy: input.strategy ?? null,
      rejectReason: reason,
      createdAt: nowMs,
      updatedAt: nowMs,
      fills: [],
      delayTicksRemaining: 0,
    }
    this.orders.set(order.orderId, order)
    return order
  }

  private matchOrder(order: SimOrder, market: SimulatedMarket, nowMs: number): void {
    const quote = market.get(order.symbol)
    if (!quote || quote.defect === "outage" || quote.defect === "missing_candle") return
    if (quote.availableQty <= 0) return

    const triggered = this.isTriggered(order, quote.last)
    if (!triggered) return

    if (order.orderType === "LIMIT" || order.orderType === "SL-L") {
      if (!this.limitMarketable(order, quote.last)) return
    }

    const remaining = order.quantity - order.filledQty
    if (remaining <= 0) return

    const fillQty = Math.min(remaining, quote.availableQty)
    if (fillQty <= 0) return

    const px = this.fillPrice(order, quote)
    const fee = (px * fillQty * this.feeBps) / 10_000
    const fill: FillEvent = {
      fillId: `fill:${this.fillSeq++}`,
      orderId: order.orderId,
      symbol: order.symbol,
      side: order.side,
      quantity: fillQty,
      price: px,
      fee,
      at: nowMs,
    }
    order.fills.push(fill)
    order.filledQty += fillQty
    order.updatedAt = nowMs
    order.status = order.filledQty >= order.quantity ? "FILLED" : "PARTIALLY_FILLED"
    this.fills.push(fill)
    quote.availableQty -= fillQty
  }

  private isTriggered(order: SimOrder, last: number): boolean {
    if (order.orderType === "MARKET" || order.orderType === "LIMIT") return true
    const trigger = order.triggerPrice
    if (trigger == null) return false
    if (order.side === "BUY") return last >= trigger
    return last <= trigger
  }

  private limitMarketable(order: SimOrder, last: number): boolean {
    const limit = order.price
    if (limit == null) return false
    if (order.side === "BUY") return last <= limit
    return last >= limit
  }

  private fillPrice(order: SimOrder, quote: { last: number; bid: number; ask: number }): number {
    let px = order.side === "BUY" ? quote.ask : quote.bid
    if (order.orderType === "LIMIT" || order.orderType === "SL-L") {
      px = order.price ?? px
    }
    const slip = this.slippagePoints(quote.last)
    if (order.side === "BUY") px += slip
    else px -= slip
    return roundPx(Math.max(0.05, px))
  }

  private slippagePoints(last: number): number {
    const { mode, points = 0, percent = 0 } = this.slippage
    switch (mode) {
      case "zero":
        return 0
      case "fixed":
        return points
      case "percent":
        return last * (percent / 100)
      case "volatility":
        return last * 0.002 + points
      case "liquidity":
        return last * 0.004 + points
      case "seeded":
        return (this.rng() - 0.5) * 2 * (points || last * 0.001)
      default:
        return 0
    }
  }
}

function isTerminal(status: OrderStatus): boolean {
  return (
    status === "FILLED" ||
    status === "CANCELLED" ||
    status === "REJECTED" ||
    status === "EXPIRED" ||
    status === "FAILED"
  )
}

function cloneOrder(o: SimOrder): SimOrder {
  return { ...o, fills: o.fills.map(f => ({ ...f })) }
}
