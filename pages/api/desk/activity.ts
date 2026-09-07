import { sendApiError } from "../../../lib/apiErrors"
import logger from "../../../lib/logger"
import withSession from "../../../lib/session"
import { listAudit, listDecisions, listRecon } from "../../../lib/trading/portfolio"
import { parseTradeBook } from "../../../lib/trading/types"

export default withSession(async (req, res) => {
  const user = req.session.user
  if (!user) return res.status(401).end()
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" })
  try {
    const book = parseTradeBook(req.query.book)
    const [audit, decisions, recon] = await Promise.all([
      listAudit(150),
      listDecisions({ limit: 100, book }),
      listRecon(50),
    ])
    return res.json({ audit, decisions, recon })
  } catch (e) {
    return sendApiError(res, e, logger, "desk/activity")
  }
})
