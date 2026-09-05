/**
 * In-memory sliding-window rate limiter for Express (single-process).
 * Suitable for personal single-instance deployment.
 */

function parseLimit(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

const DEFAULT_WINDOW_MS = parseLimit(process.env.RATE_LIMIT_WINDOW_MS, 60_000)

const LIMITS = {
  oauth: parseLimit(process.env.RATE_LIMIT_OAUTH, 20),
  destructive: parseLimit(process.env.RATE_LIMIT_DESTRUCTIVE, 30),
}

const buckets = new Map()

function clientKey(req) {
  const forwarded = req.headers["x-forwarded-for"]
  if (typeof forwarded === "string" && forwarded.length) {
    return forwarded.split(",")[0].trim()
  }
  return req.socket?.remoteAddress || "unknown"
}

function hit(key, limit, windowMs) {
  const now = Date.now()
  let bucket = buckets.get(key)
  if (!bucket || now - bucket.start >= windowMs) {
    bucket = { start: now, count: 0 }
    buckets.set(key, bucket)
  }
  bucket.count += 1
  if (bucket.count > limit) {
    return false
  }
  return true
}

function rateLimitMiddleware({ name, limit, windowMs = DEFAULT_WINDOW_MS }) {
  return (req, res, next) => {
    const key = `${name}:${clientKey(req)}`
    if (hit(key, limit, windowMs)) {
      return next()
    }
    res.status(429).json({ error: "Too many requests. Try again shortly." })
  }
}

function createSensitiveRouteLimiter() {
  return (req, res, next) => {
    const path = req.path || req.url || ""
    if (path.startsWith("/api/redirect_url_kite")) {
      return rateLimitMiddleware({ name: "oauth", limit: LIMITS.oauth })(req, res, next)
    }
    if (
      (path.startsWith("/api/kill-desk") || path.startsWith("/api/trades_day")) &&
      req.method === "POST"
    ) {
      return rateLimitMiddleware({ name: "destructive", limit: LIMITS.destructive })(req, res, next)
    }
    return next()
  }
}

module.exports = { createSensitiveRouteLimiter, rateLimitMiddleware }
