const { getIronSession } = require("iron-session")
const { isSessionCookieSecure } = require("./sessionCookie")

const COOKIE_NAME = "khaching-kite-session"

function sessionOptions() {
  const password = process.env.SECRET_COOKIE_PASSWORD
  if (!password || password.length < 32) {
    throw new Error("SECRET_COOKIE_PASSWORD must be set and at least 32 characters")
  }
  return {
    password,
    cookieName: COOKIE_NAME,
    cookieOptions: {
      secure: isSessionCookieSecure(),
      sameSite: "lax",
      httpOnly: true,
    },
  }
}

async function sessionMiddleware(req, res, next) {
  try {
    const session = await getIronSession(req, res, sessionOptions())
    req.session = {
      get: key => session[key],
      set: (key, value) => {
        session[key] = value
      },
      save: () => session.save(),
      destroy: () => session.destroy(),
    }
    return next()
  } catch (e) {
    return next(e)
  }
}

module.exports = { sessionMiddleware, COOKIE_NAME }
