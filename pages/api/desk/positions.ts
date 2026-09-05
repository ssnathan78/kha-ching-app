import { sendApiError } from "../../../lib/apiErrors"
import logger from "../../../lib/logger"
import withSession from "../../../lib/session"
import { listPositions } from "../../../lib/trading/portfolio"

export default withSession(async (req, res) => {
  const user = req.session.user
  if (!user) return res.status(401).end()
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" })
  try {
    return res.json({ positions: await listPositions() })
  } catch (e) {
    return sendApiError(res, e, logger, "desk/positions")
  }
})
