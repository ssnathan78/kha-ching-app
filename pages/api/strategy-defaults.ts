import { sendApiError } from "../../lib/apiErrors"
import { STRATEGIES } from "../../lib/constants"
import logger from "../../lib/logger"
import withSession from "../../lib/session"
import { getMergedDefaults, upsertDefaults } from "../../lib/strategyDefaults"
import { validatePlanConfig } from "../../lib/strategyValidation"

export default withSession(async (req, res) => {
  const user = req.session.user
  if (!user) {
    return res.status(401).send("Unauthorized")
  }

  const strategy = (req.method === "GET" ? req.query.strategy : req.body?.strategy) as string
  if (strategy === STRATEGIES.SUBSCRIBE_CHASE) {
    return res.status(400).json({ error: "Chase uses /api/chase-settings, not weekday defaults" })
  }

  try {
    if (req.method === "GET") {
      const config = await getMergedDefaults(strategy as STRATEGIES)
      return res.json({ strategy, config })
    }

    if (req.method === "PUT") {
      const config = req.body?.config || {}
      const current = await getMergedDefaults(strategy as STRATEGIES)
      const { getMaxLotsForStrategy } = await import("../../lib/trading/riskSettings")
      const validation = validatePlanConfig(
        { ...current, ...config, strategy },
        { maxLots: await getMaxLotsForStrategy(strategy) }
      )
      if (!validation.ok) {
        return res.status(400).json({ error: validation.error })
      }
      const saved = await upsertDefaults(strategy as STRATEGIES, config)
      return res.json({ strategy, config: saved })
    }

    return res.status(405).json({ error: "Method not allowed" })
  } catch (e) {
    return sendApiError(res, e, logger, "strategy-defaults")
  }
})
