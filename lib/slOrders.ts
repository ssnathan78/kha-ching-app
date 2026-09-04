import type { KiteOrder } from "../types/kite"
import { round } from "./tickSize"

type KiteSide = {
  TRANSACTION_TYPE_SELL: string
  TRANSACTION_TYPE_BUY: string
  ORDER_TYPE_SL: string
}

export const convertSlmToSll = (
  slmOrder: KiteOrder,
  slLimitPricePercent: number,
  kite: KiteSide
): KiteOrder => {
  const sllOrder = { ...slmOrder }
  const trigger = sllOrder.trigger_price ?? 0
  const absoluteLimitPriceDelta = ((slLimitPricePercent ?? 0) / 100) * trigger
  let absoluteLimitPrice = trigger
  if (sllOrder.transaction_type === kite.TRANSACTION_TYPE_SELL) {
    absoluteLimitPrice = trigger - absoluteLimitPriceDelta
  } else {
    absoluteLimitPrice = trigger + absoluteLimitPriceDelta
  }

  sllOrder.order_type = kite.ORDER_TYPE_SL
  sllOrder.price = round(absoluteLimitPrice)

  if (sllOrder.price === sllOrder.trigger_price) {
    sllOrder.price =
      sllOrder.transaction_type === kite.TRANSACTION_TYPE_BUY
        ? sllOrder.price + 0.1
        : sllOrder.price - 0.1
  }

  return sllOrder
}
