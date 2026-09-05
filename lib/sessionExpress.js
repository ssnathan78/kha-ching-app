const { getIronSession } = require("iron-session")
const { getSessionOptions, SESSION_COOKIE_NAME } = require("./sessionOptions")

async function sessionMiddleware(req, res, next) {
  try {
    req.session = await getIronSession(req, res, getSessionOptions())
    return next()
  } catch (e) {
    return next(e)
  }
}

module.exports = { sessionMiddleware, COOKIE_NAME: SESSION_COOKIE_NAME }
