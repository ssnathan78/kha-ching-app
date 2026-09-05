/**
 * Simulation must never reach a live Kite endpoint or place a live order.
 * Fail closed: any violation throws before an order can leave the process.
 */

const LIVE_HOST_RE = /kite\.zerodha\.com|api\.kite\.trade/i

export class SimulationIsolationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SimulationIsolationError"
  }
}

export function isSimulationProcess(): boolean {
  return process.env.SIMULATION === "true"
}

export function assertSimulationSafe(context = "simulation"): void {
  if (process.env.SIMULATION !== "true") {
    throw new SimulationIsolationError(`${context}: SimulatedExchange requires SIMULATION=true`)
  }
  const mock = process.env.MOCK_ORDERS
  if (mock !== "true" && mock !== "1") {
    throw new SimulationIsolationError(
      `${context}: refused — MOCK_ORDERS must be true so live Kite cannot be used`
    )
  }
  if (process.env.KITE_LIVE === "true" || process.env.ALLOW_LIVE_SIM === "true") {
    throw new SimulationIsolationError(`${context}: refused — live trading flags are set`)
  }
  const api = `${process.env.KITE_API_ENDPOINT || ""} ${process.env.KITE_HOST || ""}`
  if (LIVE_HOST_RE.test(api)) {
    throw new SimulationIsolationError(`${context}: refused — live Kite host configured`)
  }
}

/** Reject any object that looks like a real kiteconnect client. */
export function assertNotLiveKite(value: unknown, context = "simulation"): void {
  if (value == null || typeof value !== "object") return
  const ctor = (value as { constructor?: { name?: string } }).constructor?.name
  if (ctor === "KiteConnect" || ctor === "KiteTicker") {
    throw new SimulationIsolationError(`${context}: refused a live Kite client`)
  }
  const rec = value as { api_key?: string; requestAccessToken?: unknown; getLTP?: unknown }
  if (typeof rec.requestAccessToken === "function" && typeof rec.getLTP === "function") {
    throw new SimulationIsolationError(`${context}: refused an object that looks like KiteConnect`)
  }
}

export function guardSimulatedUrl(url: string): void {
  if (LIVE_HOST_RE.test(url)) {
    throw new SimulationIsolationError(`simulation refused live URL ${url}`)
  }
}
