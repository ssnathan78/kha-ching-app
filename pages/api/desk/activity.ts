import { sendApiError } from "../../../lib/apiErrors"
import logger from "../../../lib/logger"
import withSession from "../../../lib/session"
import { listAudit, listDecisions, listRecon } from "../../../lib/trading/portfolio"

export default withSession(async (req, res) => {
  const user = req.session.user
  if (!user) return res.status(401).end()
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" })
  try {
    const [audit, decisions, recon] = await Promise.all([
      listAudit(150),
      listDecisions(100),
      listRecon(50),
    ])
    return res.json({ audit, decisions, recon })
  } catch (e) {
    return sendApiError(res, e, logger, "desk/activity")
  }
})
