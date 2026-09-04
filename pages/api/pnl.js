import { syncGetKiteInstance } from "../../lib/kiteUtils"
import logger from "../../lib/logger"
import { rupeePnl, strategyPointsFromFills } from "../../lib/pnl"
import withSession from "../../lib/session"
import { withRemoteRetry } from "../../lib/utils"

export default withSession(async (req, res) => {
  const user = req.session.get("user")

  if (!user) {
    return res.status(401).send("Unauthorized")
  }

  try {
    const { order_tag: orderTag } = req.query

    if (!orderTag) {
      return res.status(400).json({ error: "expected orderTag in query" })
    }

    const kite = syncGetKiteInstance(user)
    const allOrders = await withRemoteRetry(() => kite.getOrders())
    const taggedOrders = allOrders.filter(
      order => order.tag === orderTag && order.status === "COMPLETE"
    )

    if (taggedOrders.length === 0) {
      return res.json({ error: "No completed orders found for tag", pnl: null, points: null })
    }

    const pnl = rupeePnl(taggedOrders)
    const points = strategyPointsFromFills(taggedOrders)
    res.json({ pnl, points, currency: "INR" })
  } catch (e) {
    logger.error("[api/pnl] error", e)
    res.status(500).json({ error: e.message })
  }
})
