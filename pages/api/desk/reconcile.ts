import { sendApiError } from "../../../lib/apiErrors"
import { syncGetKiteInstance } from "../../../lib/kiteUtils"
import logger from "../../../lib/logger"
import withSession from "../../../lib/session"
import {
  type BrokerSnapshot,
  fetchBrokerSnapshot,
  reconcileWithBroker,
} from "../../../lib/trading/reconcile"
import { isMockOrder } from "../../../lib/utils"

export default withSession(async (req, res) => {
  const user = req.session.user
  if (!user) return res.status(401).end()
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })
  try {
    let broker: BrokerSnapshot | null = null
    if (!isMockOrder() && user.session?.access_token) {
      const kite = syncGetKiteInstance(user)
      broker = await fetchBrokerSnapshot(kite as never)
    }
    const result = await reconcileWithBroker(broker)
    return res.json(result)
  } catch (e) {
    return sendApiError(res, e, logger, "desk/reconcile")
  }
})
