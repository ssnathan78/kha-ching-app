import type { NextApiResponse } from "next"
import type { Logger } from "winston"

const SENSITIVE_PATTERNS = [
  /access_token/i,
  /refresh_token/i,
  /SECRET_COOKIE_PASSWORD/i,
  /KITE_API_SECRET/i,
  /password/i,
]

export function redactForLog(value: unknown): unknown {
  if (value == null) return value
  if (typeof value === "string") {
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(value)) return "[REDACTED]"
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map(redactForLog)
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_PATTERNS.some(p => p.test(key))) {
        out[key] = "[REDACTED]"
      } else {
        out[key] = redactForLog(val)
      }
    }
    return out
  }
  return value
}

export function safeErrorMessage(err: unknown, fallback = "Internal server error"): string {
  if (process.env.NODE_ENV !== "production") {
    if (err instanceof Error) return err.message
    return String(err)
  }
  if (err instanceof Error && err.message && !err.message.includes(" at ")) {
    return err.message
  }
  return fallback
}

export function sendApiError(
  res: NextApiResponse,
  err: unknown,
  logger: Logger,
  context: string,
  status = 500
) {
  logger.error(`[${context}]`, err)
  return res.status(status).json({ error: safeErrorMessage(err) })
}
