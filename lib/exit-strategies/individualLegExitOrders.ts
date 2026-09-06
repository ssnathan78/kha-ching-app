import type { KiteOrder } from "../../types/kite"
import { SL_ORDER_TYPE } from "../../types/plans"
import type {
  ATM_STRADDLE_TRADE,
  ATM_STRANGLE_TRADE,
  SUPPORTED_TRADE_CONFIG,
} from "../../types/trade"

type StraddleOrStrangleTrade = ATM_STRADDLE_TRADE | ATM_STRANGLE_TRADE

import { STATUS_TRIGGER_PENDING } from "../constants"
import { remoteOrderSuccessEnsurer, syncGetKiteInstance } from "../kiteUtils"
import logger from "../logger"
import { convertSlmToSll } from "../slOrders"
import { attemptBrokerOrders, round } from "../utils"
import { doDeletePendingOrders, doSquareOffPositions } from "./autoSquareOff"

async function individualLegExitOrders({
  _kite,
  initialJobData,
  rawKiteOrdersResponse,
}: {
  _kite?: any
  initialJobData: SUPPORTED_TRADE_CONFIG
  rawKiteOrdersResponse: KiteOrder[]
}): Promise<KiteOrder[] | null> {
  const completedOrders = rawKiteOrdersResponse
  if (!(Array.isArray(completedOrders) && completedOrders.length)) {
    return null
  }

  const {
    slmPercent,
    user,
    orderTag,
    rollback,
    slLimitPricePercent = 1,
    instrument,
    // isMaxLossEnabled,
    // isMaxProfitEnabled
  } = initialJobData as StraddleOrStrangleTrade

  const slOrderType = SL_ORDER_TYPE.SLL
  const kite = _kite || syncGetKiteInstance(user)

  const exitOrders = completedOrders.map(order => {
    const {
      tradingsymbol,
      exchange,
      transaction_type: transactionType,
      product,
      quantity,
      average_price: avgOrderPrice,
    } = order
    // if (isMaxLossEnabled ||isMaxProfitEnabled)
    // totalOrders.push (order);
    let exitOrderTransactionType: string
    let exitOrderTriggerPrice: number

    const absoluteSl: number = (slmPercent / 100) * avgOrderPrice!
    if (transactionType === kite.TRANSACTION_TYPE_SELL) {
      // original order is short positions
      // exit orders would be buy orders with prices slmPercent above the avg sell prices
      exitOrderTransactionType = kite.TRANSACTION_TYPE_BUY
      exitOrderTriggerPrice = avgOrderPrice! + absoluteSl
    } else {
      // original order is long positions
      exitOrderTransactionType = kite.TRANSACTION_TYPE_SELL
      exitOrderTriggerPrice = avgOrderPrice! - absoluteSl
    }

    let exitOrder: KiteOrder = {
      transaction_type: exitOrderTransactionType,
      trigger_price: exitOrderTriggerPrice,
      order_type: kite.ORDER_TYPE_SLM,
      quantity: Math.abs(quantity),
      tag: orderTag!,
      product,
      tradingsymbol,
      exchange,
    }

    if (slOrderType === SL_ORDER_TYPE.SLL) {
      exitOrder = convertSlmToSll(exitOrder, slLimitPricePercent!, kite)
    }

    exitOrder.trigger_price = round(exitOrder.trigger_price!)
    logger.info("placing exit orders...", exitOrder)
    return exitOrder
  })

  const exitOrderPrs = exitOrders.map(async order =>
    remoteOrderSuccessEnsurer({
      _kite: kite,
      ensureOrderState: STATUS_TRIGGER_PENDING,
      orderProps: order,
      instrument,
      user: user!,
    })
  )

  const { allOk, statefulOrders } = await attemptBrokerOrders(exitOrderPrs)
  if (!allOk && rollback?.onBrokenExitOrders) {
    await doDeletePendingOrders(statefulOrders, kite)
    await doSquareOffPositions(completedOrders, kite, {
      orderTag,
    })

    throw Error("rolled back onBrokenExitOrders")
  }

  if (slOrderType === SL_ORDER_TYPE.SLL) {
    try {
      await Promise.all(statefulOrders)
    } catch (e) {
      logger.error("error adding to `watcherQueueJobs`")
      logger.info(e.message ? e.message : e)
    }
  }
  // if (isMaxLossEnabled ||isMaxProfitEnabled)
  // {
  //  await addToNextQueue(initialJobData, {
  //   _nextTradingQueue: TARGETPNL_Q_NAME,
  //    orders:totalOrders
  // })
  // console.log('Added to TargetPNLQueue') ;
  // }

  return statefulOrders
}

export default individualLegExitOrders
