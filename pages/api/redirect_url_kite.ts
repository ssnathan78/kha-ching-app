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

function kiteErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as {
      message?: string
      error_type?: string
      data?: { message?: string } | null
    }
    return e.data?.message || e.message || e.error_type || "Kite login failed"
  }
  return "Kite login failed"
}

function slimSession(sessionData: SessionData): SessionData {
  return {
    access_token: sessionData.access_token,
    refresh_token: sessionData.refresh_token,
    user_id: sessionData.user_id,
    user_name: sessionData.user_name,
    user_shortname: sessionData.user_shortname,
    email: sessionData.email,
    user_type: sessionData.user_type,
    broker: sessionData.broker,
    avatar_url: sessionData.avatar_url,
    api_key: sessionData.api_key,
    public_token: sessionData.public_token,
    login_time: sessionData.login_time,
  } as SessionData
}

export default withSession(async (req, res) => {
  const rawToken = req.query.request_token
  const requestToken = Array.isArray(rawToken) ? rawToken[0] : rawToken

  if (!requestToken) {
    return res.redirect("/?loginError=missing_request_token")
  }
  logger.info("[redirect_url_kite] exchanging request_token")

  try {
    const sessionData: SessionData = await kc.generateSession(requestToken, kiteSecret)
    const user: KiteUser = { isLoggedIn: true, session: slimSession(sessionData) }
    req.session.set("user", user)
    await req.session.save()
    logger.info("[redirect_url_kite] session cookie saved")

    getIndexInstruments().catch(e => {
      logger.error("[redirect_url_kite] getIndexInstruments error", e)
    })

    try {
      const existingAccessToken = await checksameToken(user.session.access_token!)
      if (!existingAccessToken) {
        logger.info("[redirect_url_kite] first token of the day — scheduling ancillary jobs")
        await addToAncillaryQueue(user)
        await addToCoSquareOff(user)
        await addToChaseQueue(user)
        await storeAccessToken(user.session.access_token!)
      }
    } catch (queueError) {
      logger.error("[redirect_url_kite] post-login jobs failed (login still succeeds)", queueError)
    }

    res.redirect("/dashboard")
  } catch (error: unknown) {
    const message = kiteErrorMessage(error)
    logger.error("[redirect_url_kite] login failed", message, error)
    res.redirect(`/?loginError=${encodeURIComponent(message)}`)
  }
})
