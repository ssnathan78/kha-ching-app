import { expiryTypesForInstrument, EXPIRY_TYPE, INSTRUMENT_DETAILS, INSTRUMENTS } from "../../lib/constants"

describe("index contract specs (2026 NSE)", () => {
  it("uses current lot sizes", () => {
    expect(INSTRUMENT_DETAILS[INSTRUMENTS.NIFTY].lotSize).toBe(65)
    expect(INSTRUMENT_DETAILS[INSTRUMENTS.BANKNIFTY].lotSize).toBe(30)
    expect(INSTRUMENT_DETAILS[INSTRUMENTS.FINNIFTY].lotSize).toBe(60)
  })

  it("only Nifty has weekly expiry options in the UI", () => {
    expect(INSTRUMENT_DETAILS[INSTRUMENTS.NIFTY].hasWeeklyExpiry).toBe(true)
    expect(INSTRUMENT_DETAILS[INSTRUMENTS.BANKNIFTY].hasWeeklyExpiry).toBe(false)
    expect(INSTRUMENT_DETAILS[INSTRUMENTS.FINNIFTY].hasWeeklyExpiry).toBe(false)
    expect(expiryTypesForInstrument(INSTRUMENTS.NIFTY)).toContain(EXPIRY_TYPE.MONTHLY)
    expect(expiryTypesForInstrument(INSTRUMENTS.BANKNIFTY)).not.toContain(EXPIRY_TYPE.MONTHLY)
  })
})
