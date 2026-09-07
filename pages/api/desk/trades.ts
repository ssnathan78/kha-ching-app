import { sendApiError } from "../../../lib/apiErrors"
import logger from "../../../lib/logger"
import withSession from "../../../lib/session"
import { listTrades } from "../../../lib/trading/portfolio"
import { parseTradeBook } from "../../../lib/trading/types"

export default withSession(async (req, res) => {
  const user = req.session.user
  if (!user) return res.status(401).end()
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" })
  try {
    const from = typeof req.query.from === "string" ? req.query.from : undefined
    const to = typeof req.query.to === "string" ? req.query.to : undefined
    return res.json({
      trades: await listTrades({
        limit: 500,
        book: parseTradeBook(req.query.book),
        from,
        to,
      }),
    })
  } catch (e) {
    return sendApiError(res, e, logger, "desk/trades")
  }
})
