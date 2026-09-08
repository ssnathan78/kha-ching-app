import {
  chaseInstrumentFromTradingsymbol,
  executionModeSwitchBlocked,
  flattenRowPlan,
  ledgerRowsForActiveBook,
  phantomClearBlocked,
  splitLedgerQty,
  squareOffQtySource,
} from "../../../lib/trading/bookSplit"

describe("bookSplit", () => {
  it("splits ledger qty by provenance and optional strategy", () => {
    expect(
      splitLedgerQty(
        [
          { strategy: "CHASE", tradingsymbol: "NIFTY26SEPFUT", quantity: -65, provenance: "PAPER" },
          { strategy: "CHASE", tradingsymbol: "NIFTY26SEPFUT", quantity: 65, provenance: "LIVE" },
          {
            strategy: "ATM_STRADDLE",
            tradingsymbol: "NIFTY26SEP25000CE",
            quantity: -65,
            provenance: "PAPER",
          },
        ],
        { strategy: "ATM_STRADDLE" }
      )
    ).toEqual({ paperLedgerQty: -65, liveLedgerQty: 0 })
  })

  it("blocks Paper↔Live for any strategy with an open from-book", () => {
    const blocked = executionModeSwitchBlocked({
      processMock: false,
      strategy: "ATM_STRADDLE",
      fromMode: "PAPER",
      toMode: "LIVE",
      paperLedgerQty: -65,
      liveLedgerQty: 0,
    })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.error).toMatch(/ATM_STRADDLE/)
  })

  it("does not block a switch when the from-book is flat", () => {
    expect(
      executionModeSwitchBlocked({
        processMock: false,
        strategy: "ATM_STRANGLE",
        fromMode: "PAPER",
        toMode: "LIVE",
        paperLedgerQty: 0,
        liveLedgerQty: 0,
      }).ok
    ).toBe(true)
  })

  it("never mixes paper leftover into a live square-off after Kite answered empty", () => {
    expect(
      squareOffQtySource({ paperBook: false, kiteQueried: true, kiteNetLength: 0 })
    ).toBe("empty")
    expect(
      squareOffQtySource({ paperBook: false, kiteQueried: true, kiteNetLength: 2 })
    ).toBe("kite")
    expect(
      squareOffQtySource({ paperBook: false, kiteQueried: false, kiteNetLength: 0 })
    ).toBe("live-ledger")
    expect(
      squareOffQtySource({ paperBook: true, kiteQueried: false, kiteNetLength: 0 })
    ).toBe("paper-ledger")
  })

  it("filters ledger rows to the active book", () => {
    const rows = [
      { strategy: "ATM_STRADDLE", quantity: -65, provenance: "PAPER" },
      { strategy: "ATM_STRADDLE", quantity: -65, provenance: "LIVE" },
      { strategy: "CHASE", quantity: -130, provenance: "PAPER" },
    ]
    expect(
      ledgerRowsForActiveBook(rows, { paperBook: true, strategy: "ATM_STRADDLE" }).map(
        r => r.provenance
      )
    ).toEqual(["PAPER"])
    expect(
      ledgerRowsForActiveBook(rows, { paperBook: false, strategy: "ATM_STRADDLE" }).map(
        r => r.provenance
      )
    ).toEqual(["LIVE"])
  })

  it("refuses to clear a live phantom while Kite still has size", () => {
    const blocked = phantomClearBlocked({
      paperBook: false,
      processMock: false,
      workingOrders: 0,
      kiteAvailable: true,
      kiteQty: -65,
    })
    expect(blocked.ok).toBe(false)
  })

  it("allows clearing paper leftover without Kite", () => {
    expect(
      phantomClearBlocked({
        paperBook: true,
        processMock: false,
        workingOrders: 0,
        kiteAvailable: false,
        kiteQty: 0,
      }).ok
    ).toBe(true)
  })

  it("does not skip a live flatten when Kite is down — uses live ledger", () => {
    expect(squareOffQtySource({ paperBook: false, kiteQueried: false, kiteNetLength: 0 })).toBe(
      "live-ledger"
    )
  })
})

describe("flattenRowPlan", () => {
  it("flattens paper leftover from the ledger and never invents lots", () => {
    expect(
      flattenRowPlan({ ledgerQty: -130, paperBook: true, kiteQueried: false, kiteQty: 0 })
    ).toEqual({ action: "flatten", qty: 130, side: "BUY" })
    expect(
      flattenRowPlan({ ledgerQty: 0, paperBook: true, kiteQueried: false, kiteQty: 0 })
    ).toEqual({ action: "skip", reason: "already flat" })
  })

  it("does not open size when the live broker is already flat", () => {
    expect(
      flattenRowPlan({ ledgerQty: -65, paperBook: false, kiteQueried: true, kiteQty: 0 })
    ).toEqual({ action: "skip", reason: "broker already flat" })
  })

  it("uses kite size for a live book, and live ledger if Kite is down", () => {
    expect(
      flattenRowPlan({ ledgerQty: -65, paperBook: false, kiteQueried: true, kiteQty: -130 })
    ).toEqual({ action: "flatten", qty: 130, side: "BUY" })
    expect(
      flattenRowPlan({ ledgerQty: 65, paperBook: false, kiteQueried: false, kiteQty: 0 })
    ).toEqual({ action: "flatten", qty: 65, side: "SELL" })
  })

  it("maps BankNifty futures to BANKNIFTY rather than NIFTY", () => {
    expect(chaseInstrumentFromTradingsymbol("BANKNIFTY26SEPFUT")).toBe("BANKNIFTY")
    expect(chaseInstrumentFromTradingsymbol("NIFTY26SEPFUT")).toBe("NIFTY")
    expect(chaseInstrumentFromTradingsymbol("FINNIFTY26SEPFUT")).toBe("FINNIFTY")
  })
})
