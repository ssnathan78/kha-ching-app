const dayjs = require("dayjs")
const utc = require("dayjs/plugin/utc")
const timezone = require("dayjs/plugin/timezone")
const { isSessionCookieSecure } = require("./sessionCookie")

dayjs.extend(utc)
dayjs.extend(timezone)

const SESSION_COOKIE_NAME = "khaching-kite-session"

/** Seconds until next 7 AM IST. Used for session TTL. */
function secondsTill7() {
  const nowIst = dayjs().tz("Asia/Kolkata")
  const next7AmIst =
    nowIst.hour() >= 7 ? nowIst.add(1, "day").startOf("day").hour(7) : nowIst.startOf("day").hour(7)
  return next7AmIst.diff(nowIst, "second")
}

function getSessionOptions() {
  const password = process.env.SECRET_COOKIE_PASSWORD
  if (!password || password.length < 32) {
    throw new Error("SECRET_COOKIE_PASSWORD must be set and at least 32 characters")
  }

  let logger
  try {
    logger = require("./logger").default
  } catch {
    logger = { warn: () => {} }
  }

  return {
    password,
    cookieName: SESSION_COOKIE_NAME,
    ttl: secondsTill7(),
    cookieOptions: {
      secure: isSessionCookieSecure(),
      sameSite: "lax",
      httpOnly: true,
    },
    onUnsealError: error => {
      logger.warn("[session] unseal error", error)
    },
  }
}

module.exports = { SESSION_COOKIE_NAME, getSessionOptions, secondsTill7 }
