import { simulate } from "../../lib/simulation/runner"

const CE = "NIFTY25SEP25000CE"
const PE = "NIFTY25SEP25000PE"

const ONE_WAY = [
  "straddle-920-one-way-holds-other-leg",
  "strangle-920-one-way-holds-other-leg",
] as const

const CHOP = [
  "straddle-920-chop-stops-both-legs",
  "strangle-920-chop-stops-both-legs",
] as const

function roles(result: ReturnType<typeof simulate>, symbol: string, role: string) {
  return result.orders.filter(
    o => o.symbol === symbol && o.role === role && o.status !== "REJECTED"
  )
}

function qty(result: ReturnType<typeof simulate>, symbol: string) {
  return result.positions.find(p => p.symbol === symbol)?.quantity ?? 0
}

describe("9:20 straddle / strangle", () => {
  it.each(ONE_WAY)("%s stops only the losing CE and holds PE until square-off", name => {
    const result = simulate({ scenario: name, seed: 1 })
    expect(result.invariantViolations).toEqual([])
    expect(result.assertionResults.every(a => a.ok)).toBe(true)
    expect(roles(result, CE, "SL").length).toBeGreaterThanOrEqual(1)
    expect(roles(result, PE, "SL")).toEqual([])
    expect(roles(result, PE, "EXIT").length).toBeGreaterThanOrEqual(1)
    expect(roles(result, CE, "EXIT")).toEqual([])
    expect(qty(result, CE)).toBe(0)
    expect(qty(result, PE)).toBe(0)
  })

  it.each(CHOP)("%s stops both wings and does not invent size at square-off", name => {
    const result = simulate({ scenario: name, seed: 1 })
    expect(result.invariantViolations).toEqual([])
    expect(result.assertionResults.every(a => a.ok)).toBe(true)
    expect(roles(result, CE, "SL").length).toBeGreaterThanOrEqual(1)
    expect(roles(result, PE, "SL").length).toBeGreaterThanOrEqual(1)
    expect(qty(result, CE)).toBe(0)
    expect(qty(result, PE)).toBe(0)
    const invented = result.orders.filter(
      o => o.role === "EXIT" && o.status !== "REJECTED" && (o.symbol === CE || o.symbol === PE)
    )
    expect(invented).toEqual([])
  })
})
