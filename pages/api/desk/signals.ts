import { sendApiError } from "../../../lib/apiErrors"
import logger from "../../../lib/logger"
import withSession from "../../../lib/session"
import { parseFeedClearMode, parseFeedPeriod } from "../../../lib/trading/feedWindow"
import { deleteSignalsForPeriod, listStrategySignals } from "../../../lib/trading/signals"

export default withSession(async (req, res) => {
  const user = req.session.user
  if (!user) return res.status(401).end()
  try {
    if (req.method === "GET") {
      const period = parseFeedPeriod(req.query.period)
      const strategy = typeof req.query.strategy === "string" ? req.query.strategy : null
      const planRef = typeof req.query.planRef === "string" ? req.query.planRef : null
      const jobId = typeof req.query.jobId === "string" ? req.query.jobId : null
      const orderTag = typeof req.query.orderTag === "string" ? req.query.orderTag : null
      return res.json(
        await listStrategySignals({
          period,
          strategy: strategy || null,
          planRef: planRef || null,
          jobId: jobId || null,
          orderTag: orderTag || null,
        })
      )
    }
    if (req.method === "DELETE") {
      const mode = parseFeedClearMode(req.body?.period ?? req.query.period)
      if (!mode)
        return res.status(400).json({ error: "period must be all, today, or before_today" })
      await deleteSignalsForPeriod(mode)
      return res.json({ ok: true, period: mode })
    }
    return res.status(405).json({ error: "Method not allowed" })
  } catch (e) {
    return sendApiError(res, e, logger, "desk/signals")
  }
})
