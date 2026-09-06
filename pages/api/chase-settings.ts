import { sendApiError } from "../../lib/apiErrors"
import { CHASE_MASTER_DEFAULTS } from "../../lib/chaseDefaults"
import { getChaseSettings, saveChaseSettings } from "../../lib/chaseSettings"
import { validateChaseSettings } from "../../lib/chaseValidation"
import logger from "../../lib/logger"
import withSession from "../../lib/session"

export default withSession(async (req, res) => {
  const user = req.session.user
  if (!user) {
    return res.status(401).send("Unauthorized")
  }

  try {
    if (req.method === "GET") {
      const config = await getChaseSettings()
      return res.json({ config })
    }

    if (req.method === "PUT") {
      const patch = req.body?.config || {}
      const { getMaxLotsForStrategy } = await import("../../lib/trading/riskSettings")
      const validation = validateChaseSettings(patch, {
        maxLots: await getMaxLotsForStrategy("CHASE"),
      })
      if (!validation.ok) {
        return res.status(400).json({ error: validation.error })
      }
      const config = await saveChaseSettings(patch)
      return res.json({ config })
    }

    if (req.method === "POST" && req.body?.action === "reset") {
      const config = await saveChaseSettings({ ...CHASE_MASTER_DEFAULTS, paused: false })
      return res.json({ config })
    }

    return res.status(405).json({ error: "Method not allowed" })
  } catch (e) {
    return sendApiError(res, e, logger, "chase-settings")
  }
})
