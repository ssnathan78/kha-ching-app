import { sendApiError } from "../../lib/apiErrors"
import { syncGetKiteInstance } from "../../lib/kiteUtils"
import logger from "../../lib/logger"
import withSession from "../../lib/session"

export default withSession(async (req, res) => {
  const user = req.session.user

  if (!user) {
    return res.status(401).send("Unauthorized")
  }

  try {
    const kite = syncGetKiteInstance(user)
    const positions = await kite.getPositions()

    const { net } = positions
    const misPositions = net.filter(position => position.product === "MIS")

    res.json(misPositions)
  } catch (e) {
    return sendApiError(res, e, logger, "positions")
  }
})
