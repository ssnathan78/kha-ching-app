/**
 * Integer money at 4 decimal places (1 rupee = 10_000 units).
 * Do not use IEEE floats for ledger arithmetic.
 */

export const MONEY_SCALE = 4
export const MONEY_FACTOR = 10n ** BigInt(MONEY_SCALE)

export type Money = bigint

const MONEY_RE = /^-?\d+(\.\d+)?$/

export function moneyZero(): Money {
  return 0n
}

export function moneyFromString(value: string): Money {
  const trimmed = value.trim()
  if (!MONEY_RE.test(trimmed)) {
    throw new Error(`invalid money: ${value}`)
  }
  const negative = trimmed.startsWith("-")
  const unsigned = negative ? trimmed.slice(1) : trimmed
  const [wholeRaw, fracRaw = ""] = unsigned.split(".")
  const whole = BigInt(wholeRaw || "0")
  const fracPadded = (fracRaw + "0".repeat(MONEY_SCALE)).slice(0, MONEY_SCALE)
  const extra = fracRaw.slice(MONEY_SCALE)
  let units = whole * MONEY_FACTOR + BigInt(fracPadded || "0")
  if (extra && extra.split("").some(ch => ch > "0")) {
    const first = extra[0]
    if (first >= "5") units += 1n
  }
  return negative ? -units : units
}

export function moneyFromNumber(value: number): Money {
  if (!Number.isFinite(value)) {
    throw new Error("invalid money: not finite")
  }
  return moneyFromString(value.toString())
}

export function moneyFromUnknown(value: unknown): Money {
  if (value == null || value === "") return 0n
  if (typeof value === "bigint") return value
  if (typeof value === "number") return moneyFromNumber(value)
  if (typeof value === "string") return moneyFromString(value)
  return moneyFromString(String(value))
}

export function moneyToString(value: Money): string {
  const negative = value < 0n
  const abs = negative ? -value : value
  const whole = abs / MONEY_FACTOR
  const frac = abs % MONEY_FACTOR
  const fracStr = frac.toString().padStart(MONEY_SCALE, "0")
  const sign = negative ? "-" : ""
  return `${sign}${whole.toString()}.${fracStr}`
}

export function moneyToNumber(value: Money): number {
  return Number(moneyToString(value))
}

export function moneyAdd(a: Money, b: Money): Money {
  return a + b
}

export function moneySub(a: Money, b: Money): Money {
  return a - b
}

export function moneyAbs(value: Money): Money {
  return value < 0n ? -value : value
}

export function moneyCmp(a: Money, b: Money): number {
  if (a === b) return 0
  return a > b ? 1 : -1
}

/** price × integer quantity */
export function moneyMulQty(price: Money, qty: number): Money {
  if (!Number.isInteger(qty)) {
    throw new Error("quantity must be an integer")
  }
  return price * BigInt(qty)
}

/** integer division of a money amount by a positive quantity (half-up) */
export function moneyDivQty(value: Money, qty: number): Money {
  if (!Number.isInteger(qty) || qty === 0) {
    throw new Error("quantity must be a non-zero integer")
  }
  const denom = BigInt(qty)
  const negative = value < 0n !== denom < 0n
  const absNum = value < 0n ? -value : value
  const absDen = denom < 0n ? -denom : denom
  const half = absDen / 2n
  const quot = (absNum + half) / absDen
  return negative ? -quot : quot
}

export function moneyMaterialDiff(
  a: Money,
  b: Money,
  tolerance: Money = MONEY_FACTOR / 100n
): boolean {
  return moneyAbs(a - b) > tolerance
}
