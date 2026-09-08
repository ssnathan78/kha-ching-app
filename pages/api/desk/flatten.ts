import { sendApiError } from "../../../lib/apiErrors"
import { flattenOpenPositions, parseFlattenScope } from "../../../lib/flattenOpen"
import logger from "../../../lib/logger"
import withSession from "../../../lib/session"

export default withSession(async (req, res) => {
  const user = req.session.user
  if (!user) return res.status(401).end()
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }
  const parsed = parseFlattenScope(req.body)
  if (!parsed.ok) return res.status(400).json({ error: parsed.error })
  try {
    const result = await flattenOpenPositions({ user, scope: parsed.scope })
    logger.info("[api/desk/flatten]", {
      kind: parsed.scope.kind,
      flattened: result.flattened.length,
      skipped: result.skipped.length,
      abortedJobs: result.abortedJobs.length,
      chaseReset: result.chaseReset,
    })
    return res.json(result)
  } catch (e) {
    return sendApiError(res, e, logger, "desk/flatten")
  }
})
