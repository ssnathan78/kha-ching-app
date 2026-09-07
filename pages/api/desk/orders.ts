import { sendApiError } from "../../../lib/apiErrors"
import logger from "../../../lib/logger"
import withSession from "../../../lib/session"
import { listOrders } from "../../../lib/trading/portfolio"
import { parseTradeBook } from "../../../lib/trading/types"

export default withSession(async (req, res) => {
  const user = req.session.user
  if (!user) return res.status(401).end()
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" })
  try {
    return res.json({
      orders: await listOrders({
        limit: 200,
        book: parseTradeBook(req.query.book),
      }),
    })
  } catch (e) {
    return sendApiError(res, e, logger, "desk/orders")
  }
})
