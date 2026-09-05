/**
 * Operator allowlist for Kite OAuth login.
 * In production, ALLOWED_KITE_USER_ID must be set.
 */
export function assertAllowedKiteUser(userId: string): void {
  const allowed = process.env.ALLOWED_KITE_USER_ID?.trim()
  if (process.env.NODE_ENV === "production" && !allowed) {
    throw new Error("ALLOWED_KITE_USER_ID must be set in production")
  }
  if (allowed && userId !== allowed) {
    throw new Error("This Kite account is not authorized for this application")
  }
}

export function isProductionAuthStrict(): boolean {
  return process.env.NODE_ENV === "production"
}
