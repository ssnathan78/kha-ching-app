import {
  moneyAdd,
  moneyDivQty,
  moneyFromNumber,
  moneyFromString,
  moneyMulQty,
  moneySub,
  moneyToString,
} from "../../../lib/trading/money"

describe("money", () => {
  it("parses and formats scale-4 strings", () => {
    expect(moneyToString(moneyFromString("100.5"))).toBe("100.5000")
    expect(moneyToString(moneyFromString("-1.25"))).toBe("-1.2500")
  })

  it("does not use float for 0.1 + 0.2 style sums when given strings", () => {
    const sum = moneyAdd(moneyFromString("0.1"), moneyFromString("0.2"))
    expect(moneyToString(sum)).toBe("0.3000")
  })

  it("multiplies price by integer quantity", () => {
    expect(moneyToString(moneyMulQty(moneyFromString("100.05"), 65))).toBe("6503.2500")
  })

  it("divides with half-up rounding", () => {
    expect(moneyToString(moneyDivQty(moneyFromString("10"), 3))).toBe("3.3333")
    expect(moneyToString(moneyDivQty(moneyFromString("1"), 8))).toBe("0.1250")
  })

  it("rejects non-integer quantity", () => {
    expect(() => moneyMulQty(moneyFromNumber(1), 1.5)).toThrow(/integer/)
  })

  it("subtracts", () => {
    expect(moneyToString(moneySub(moneyFromString("120"), moneyFromString("105")))).toBe("15.0000")
  })
})
