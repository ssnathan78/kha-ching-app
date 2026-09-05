import type { KiteOrder } from "../../types/kite"
import type { KiteUser } from "../../types/misc"
import { insertMultipleTransactions } from "../drizzleDbUtils"
import { syncGetKiteInstance } from "../kiteUtils"
import logger from "../logger"
import { withRemoteRetry } from "../utils"

async function orderbookSync({ user }: { user: KiteUser }): Promise<any> {
  try {
    const kite = syncGetKiteInstance(user)
    const allOrders = await withRemoteRetry(() => kite.getOrders())
    const completedOrders = allOrders.filter(order => order.status === "COMPLETE")
    if (completedOrders.length > 0) {
      logger.info(`Completed orders in ancillary queue`, completedOrders)
      await insertMultipleTransactions(
        completedOrders.map((order: KiteOrder) => ({
          order_timestamp: order.order_timestamp
            ? new Date(order.order_timestamp as string)
            : undefined,
          exchange: order.exchange,
          tradingsymbol: order.tradingsymbol,
          instrument_token: order.instrument_token,
          transaction_type: order.transaction_type,
          quantity: order.quantity,
          average_price: order.average_price,
          tag: order.tag,
          order_id: order.order_id,
          variety: order.variety,
          order_type: order.order_type,
          product: order.product,
        }))
      )
      try {
        const { fetchBrokerSnapshot, reconcileWithBroker } = await import("../trading/reconcile")
        const snapshot = await fetchBrokerSnapshot(kite as never)
        await reconcileWithBroker(snapshot)
      } catch (reconErr) {
        logger.error("[orderbookSync] ledger reconcile failed", reconErr)
      }
      return Promise.resolve({ success: true, count: completedOrders.length })
    } else return null
  } catch (e) {
    return Promise.reject(e)
  }
}

export default orderbookSync
