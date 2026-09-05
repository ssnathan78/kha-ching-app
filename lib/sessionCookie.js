/**
 * Session cookies must not be marked Secure on HTTP (local Docker).
 * Browsers will silently drop Secure cookies on http://127.0.0.1.
 */
function isSessionCookieSecure() {
  if (process.env.SESSION_COOKIE_SECURE === "false") {
    return false
  }
  if (process.env.SESSION_COOKIE_SECURE === "true") {
    return true
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || ""
  if (appUrl.startsWith("http://")) {
    return false
  }
  if (appUrl.startsWith("https://")) {
    return true
  }
  return process.env.NODE_ENV === "production"
}

module.exports = { isSessionCookieSecure }
