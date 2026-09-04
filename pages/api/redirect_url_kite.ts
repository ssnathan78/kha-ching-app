import { KiteConnect, type SessionData } from "kiteconnect"
import { checksameToken, storeAccessToken } from "../../lib/drizzleDbUtils"
import { getIndexInstruments } from "../../lib/kiteUtils"
import logger from "../../lib/logger"
import { addToAncillaryQueue, addToChaseQueue, addToCoSquareOff } from "../../lib/queue"
import withSession from "../../lib/session"
import type { KiteUser } from "../../types/misc"

const apiKey = process.env.KITE_API_KEY!
const kiteSecret = process.env.KITE_API_SECRET!
const kc = new KiteConnect({
  api_key: apiKey,
})

export default withSession(async (req, res) => {
  const rawToken = req.query.request_token
  const requestToken = Array.isArray(rawToken) ? rawToken[0] : rawToken

  if (!requestToken) {
    return res.status(401).send("Unauthorized")
  }
  logger.info("[redirect_url_kite_logger] Logging in..")

  try {
    const sessionData: SessionData = await kc.generateSession(requestToken, kiteSecret)
    const user: KiteUser = { isLoggedIn: true, session: sessionData }
    req.session.set("user", user)
    await req.session.save()

    getIndexInstruments().catch(e => {
      logger.error("getIndexInstruments error", e)
    })

    const existingAccessToken = await checksameToken(user.session.access_token!)
    if (!existingAccessToken) {
      logger.info("[redirect_url_kite_logger] first token of the day — scheduling ancillary jobs")
      addToAncillaryQueue(user)
      addToCoSquareOff(user)
      await addToChaseQueue(user)
      await storeAccessToken(user.session.access_token!)
    }

    res.redirect("/dashboard")
  } catch (error: any) {
    const fetchResponse = error?.response
    res.status(fetchResponse?.status || 500).json(error?.data)
  }
})
