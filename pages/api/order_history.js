import { sendApiError } from "../../lib/apiErrors"
import { syncGetKiteInstance } from "../../lib/kiteUtils"
import logger from "../../lib/logger"
import withSession from "../../lib/session"
export default withSession(async (req, res) => {
  const user = req.session.user

  if (!user) {
    return res.status(401).send("Unauthorized")
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const { id: orderId } = req.query

  if (!orderId || typeof orderId !== "string" || !orderId.trim()) {
    return res.status(400).json({ error: "expected id in query" })
  }

  try {
    const kite = syncGetKiteInstance(user)
    const orderHistory = await kite.getOrderHistory(orderId)
    res.json(orderHistory.reverse())
  } catch (e) {
    return sendApiError(res, e, logger, "order_history")
  }
})
