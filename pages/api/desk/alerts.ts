import { sendApiError } from "../../../lib/apiErrors"
import logger from "../../../lib/logger"
import withSession from "../../../lib/session"
import { listOperatorAlerts } from "../../../lib/trading/alerts"
import { parseFeedClearMode, parseFeedPeriod } from "../../../lib/trading/feedWindow"
import { recordFeedClear } from "../../../lib/trading/signals"

export default withSession(async (req, res) => {
  const user = req.session.user
  if (!user) return res.status(401).end()
  try {
    if (req.method === "DELETE") {
      const mode = parseFeedClearMode(req.body?.period ?? req.query.period)
      if (!mode)
        return res.status(400).json({ error: "period must be all, today, or before_today" })
      await recordFeedClear("alerts", mode)
      return res.json({ ok: true, period: mode })
    }
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" })
    const summaryOnly = req.query.summary === "1" || req.query.summary === "true"
    const period = parseFeedPeriod(req.query.period)
    const result = await listOperatorAlerts(summaryOnly ? 40 : 80, period)
    if (summaryOnly) {
      return res.json({ errorCount: result.errorCount, warnCount: result.warnCount })
    }
    return res.json(result)
  } catch (e) {
    return sendApiError(res, e, logger, "desk/alerts")
  }
})
