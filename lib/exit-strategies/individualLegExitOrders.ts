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
import { planIndividualLegStops } from "./individualLegPlan"

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

  const planned = planIndividualLegStops(
    completedOrders.map(order => ({
      tradingsymbol: order.tradingsymbol,
      transaction_type: order.transaction_type === kite.TRANSACTION_TYPE_SELL ? "SELL" : "BUY",
      average_price: Number(order.average_price),
      quantity: order.quantity,
    })),
    slmPercent
  )

  const exitOrders = completedOrders.map((order, idx) => {
    const plan = planned[idx]
    const { exchange, product } = order

    let exitOrder: KiteOrder = {
      transaction_type: plan.transaction_type,
      trigger_price: plan.trigger_price,
      order_type: kite.ORDER_TYPE_SLM,
      quantity: plan.quantity,
      tag: orderTag!,
      product,
      tradingsymbol: plan.tradingsymbol,
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
