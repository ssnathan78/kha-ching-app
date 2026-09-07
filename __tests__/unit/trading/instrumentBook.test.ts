import dayjs from "dayjs"

import {
  chaseFuturesSelection,
  futuresChain,
  monthlyOptionExpiry,
  optionExpiryDates,
  type InstrumentSlice,
} from "../../../lib/trading/instrumentBook"

function row(
  overrides: Partial<InstrumentSlice> & Pick<InstrumentSlice, "tradingsymbol" | "instrumentType">
): InstrumentSlice {
  return {
    name: "NIFTY",
    expiry: "2026-09-29",
    lotSize: 65,
    strike: 0,
    instrumentToken: 1,
    ...overrides,
  }
}

describe("futuresChain / chaseFuturesSelection", () => {
  const now = dayjs("2026-09-07T10:00:00+05:30")
  const rows: InstrumentSlice[] = [
    row({ tradingsymbol: "NIFTY26SEPFUT", instrumentType: "FUT", expiry: "2026-09-29" }),
    row({ tradingsymbol: "NIFTY26OCTFUT", instrumentType: "FUT", expiry: "2026-10-27" }),
    row({
      tradingsymbol: "BANKNIFTY26SEPFUT",
      name: "BANKNIFTY",
      instrumentType: "FUT",
      expiry: "2026-09-29",
      lotSize: 30,
    }),
    row({
      tradingsymbol: "NIFTY26SEP25000CE",
      instrumentType: "CE",
      expiry: "2026-09-08",
      strike: 25000,
    }),
  ]

  it("keeps Nifty current and next month futures, ignoring options", () => {
    const chain = futuresChain(rows, "NIFTY", now)
    expect(chain.map(r => r.tradingsymbol)).toEqual(["NIFTY26SEPFUT", "NIFTY26OCTFUT"])
  })

  it("uses front month for new entries except on expiry day", () => {
    const chain = futuresChain(rows, "NIFTY", now)
    const pick = chaseFuturesSelection(chain, now)
    expect(pick.front?.tradingsymbol).toBe("NIFTY26SEPFUT")
    expect(pick.next?.tradingsymbol).toBe("NIFTY26OCTFUT")
    expect(pick.newEntry?.tradingsymbol).toBe("NIFTY26SEPFUT")
    expect(pick.emaContracts.map(r => r.tradingsymbol)).toEqual(["NIFTY26SEPFUT"])
  })

  it("rolls new Chase entries to next month on front-month expiry day", () => {
    const expiryDay = dayjs("2026-09-29T10:00:00+05:30")
    const chain = futuresChain(rows, "NIFTY", expiryDay)
    const pick = chaseFuturesSelection(chain, expiryDay)
    expect(pick.newEntry?.tradingsymbol).toBe("NIFTY26OCTFUT")
    expect(pick.emaContracts.map(r => r.tradingsymbol)).toEqual([
      "NIFTY26SEPFUT",
      "NIFTY26OCTFUT",
    ])
  })
})

describe("option expiries", () => {
  const now = dayjs("2026-09-07T10:00:00+05:30")
  const rows: InstrumentSlice[] = [
    row({
      tradingsymbol: "NIFTY26SEP25000CE",
      instrumentType: "CE",
      expiry: "2026-09-08",
      strike: 25000,
    }),
    row({
      tradingsymbol: "NIFTY26SEP25000PE",
      instrumentType: "PE",
      expiry: "2026-09-08",
      strike: 25000,
    }),
    row({
      tradingsymbol: "NIFTY26915CE",
      instrumentType: "CE",
      expiry: "2026-09-15",
      strike: 25000,
    }),
    row({
      tradingsymbol: "NIFTY26SEP25000CEM",
      instrumentType: "CE",
      expiry: "2026-09-29",
      strike: 25000,
    }),
  ]

  it("lists unique CE/PE expiries from today and picks monthly as last in the month", () => {
    const dates = optionExpiryDates(rows, "NIFTY", now)
    expect(dates).toEqual(["2026-09-08", "2026-09-15", "2026-09-29"])
    expect(monthlyOptionExpiry(dates, now)).toBe("2026-09-29")
  })
})
