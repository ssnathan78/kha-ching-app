import { sendApiError } from "../../../lib/apiErrors"
import logger from "../../../lib/logger"
import withSession from "../../../lib/session"
import { clearPhantomPosition } from "../../../lib/trading/clearPhantomBook"
import { listPositions } from "../../../lib/trading/portfolio"
import { parseTradeBook } from "../../../lib/trading/types"

export default withSession(async (req, res) => {
  const user = req.session.user
  if (!user) return res.status(401).end()
  try {
    if (req.method === "GET") {
      return res.json({
        positions: await listPositions(parseTradeBook(req.query.book)),
      })
    }
    if (req.method === "POST") {
      const action = req.body?.action
      if (action !== "clear-phantom") {
        return res.status(400).json({ error: "action must be clear-phantom" })
      }
      const positionId = typeof req.body?.positionId === "string" ? req.body.positionId : ""
      if (!positionId) return res.status(400).json({ error: "positionId is required" })
      const result = await clearPhantomPosition({
        positionId,
        confirm: typeof req.body?.confirm === "string" ? req.body.confirm : "",
        actor: "USER",
        accessToken: user.session?.access_token,
      })
      if (!result.ok) return res.status(409).json({ error: result.error })
      return res.json(result)
    }
    return res.status(405).json({ error: "Method not allowed" })
  } catch (e) {
    return sendApiError(res, e, logger, "desk/positions")
  }
})
