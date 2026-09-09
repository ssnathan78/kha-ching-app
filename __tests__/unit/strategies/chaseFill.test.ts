import {
  chaseBookFromSources,
  chaseBookNetQty,
  chaseExecutionModeSwitchBlocked,
  chaseFillAllowsStatusFlip,
  chaseFillFromDecision,
  chaseFlattenQty,
  chaseLotsFromConfig,
  chaseStatusHasPosition,
  decideChaseInPositionSync,
  splitChaseLedgerQty,
} from "../../../lib/chaseFill"
import { decideChaseEntryAction } from "../../../lib/chaseSignal"
import { CHASE_STATUS } from "../../../lib/constants"

describe("chaseFill", () => {
  it("reads lots from Chase settings, not a missing job row", () => {
    expect(chaseLotsFromConfig(2)).toBe(2)
    expect(chaseLotsFromConfig(null)).toBe(0)
    expect(chaseLotsFromConfig(0)).toBe(0)
    expect(chaseLotsFromConfig(-1)).toBe(0)
  })

  it.each([
    {
      name: "paper ignores leftover Kite",
      input: { paperBook: true, kiteQty: -65, paperLedgerQty: 0, liveLedgerQty: 0 },
      netQty: 0,
      otherBookOpen: true,
    },
    {
      name: "paper uses paper ledger even if live leftover exists",
      input: { paperBook: true, kiteQty: 0, paperLedgerQty: -130, liveLedgerQty: 65 },
      netQty: -130,
      otherBookOpen: true,
    },
    {
      name: "live ignores leftover paper ledger",
      input: { paperBook: false, kiteQty: 0, paperLedgerQty: -130, liveLedgerQty: 0 },
      netQty: 0,
      otherBookOpen: false,
    },
    {
      name: "live prefers Kite over paper leftover",
      input: { paperBook: false, kiteQty: -65, paperLedgerQty: -130, liveLedgerQty: 0 },
      netQty: -65,
      otherBookOpen: false,
    },
    {
      name: "live falls back to live ledger when Kite is flat",
      input: { paperBook: false, kiteQty: 0, paperLedgerQty: 0, liveLedgerQty: -130 },
      netQty: -130,
      otherBookOpen: false,
    },
    {
      name: "paper with only paper size",
      input: { paperBook: true, kiteQty: 0, paperLedgerQty: 65, liveLedgerQty: 0 },
      netQty: 65,
      otherBookOpen: false,
    },
  ])("$name", ({ input, netQty, otherBookOpen }) => {
    const book = chaseBookFromSources(input)
    expect(book.netQty).toBe(netQty)
    expect(book.otherBookOpen).toBe(otherBookOpen)
    expect(chaseBookNetQty(input)).toBe(netQty)
  })

  it("splits ledger rows by provenance (missing provenance is paper)", () => {
    expect(
      splitChaseLedgerQty(
        [
          { tradingsymbol: "NIFTY26SEPFUT", quantity: -65, provenance: "PAPER" },
          { tradingsymbol: "NIFTY26SEPFUT", quantity: 65, provenance: "LIVE" },
          { tradingsymbol: "NIFTY26SEPFUT", quantity: -65, provenance: null },
          { tradingsymbol: "NIFTY26SEPFUT", quantity: 30, provenance: "MOCK" },
          { tradingsymbol: "BANKNIFTY26SEPFUT", quantity: -30, provenance: "PAPER" },
        ],
        "NIFTY26SEPFUT"
      )
    ).toEqual({ paperLedgerQty: -100, liveLedgerQty: 65 })
  })

  it("does not treat leftover paper as blocking a live Chase entry", () => {
    const book = chaseBookFromSources({
      paperBook: false,
      kiteQty: 0,
      paperLedgerQty: -130,
      liveLedgerQty: 0,
    })
    expect(book.otherBookOpen).toBe(false)
    expect(
      decideChaseEntryAction({
        automated: true,
        quantity: 65,
        netQty: book.netQty,
        side: "SHORT",
        hasOpenEntryOrder: false,
        otherBookOpen: book.otherBookOpen,
      })
    ).toBe("place_entry")
  })

  it("still blocks a paper entry while the live book is open", () => {
    const book = chaseBookFromSources({
      paperBook: true,
      kiteQty: -65,
      paperLedgerQty: 0,
      liveLedgerQty: 0,
    })
    expect(
      decideChaseEntryAction({
        automated: true,
        quantity: 65,
        netQty: book.netQty,
        side: "SHORT",
        hasOpenEntryOrder: false,
        otherBookOpen: book.otherBookOpen,
      })
    ).toBe("other_book_open")
    expect(chaseFillFromDecision("other_book_open")).toBe("failed")
  })

  it("never flattens with configured lots when the book is flat", () => {
    expect(chaseFlattenQty(0)).toBe(0)
    expect(chaseFlattenQty(-130)).toBe(130)
    expect(chaseFlattenQty(65)).toBe(65)
  })

  it.each([
    {
      name: "allows paper→live with paper size (trial is archived on save)",
      input: {
        processMock: false,
        fromMode: "PAPER" as const,
        toMode: "LIVE" as const,
        paperLedgerQty: -130,
        liveLedgerQty: 0,
        kiteQty: 0,
      },
      ok: true,
    },
    {
      name: "blocks paper→live when Kite still has size",
      input: {
        processMock: false,
        fromMode: "PAPER" as const,
        toMode: "LIVE" as const,
        paperLedgerQty: -130,
        liveLedgerQty: 0,
        kiteQty: -65,
      },
      ok: false,
    },
    {
      name: "blocks live→paper with live ledger",
      input: {
        processMock: false,
        fromMode: "LIVE" as const,
        toMode: "PAPER" as const,
        paperLedgerQty: 0,
        liveLedgerQty: -65,
        kiteQty: 0,
      },
      ok: false,
    },
    {
      name: "blocks live→paper with Kite qty even if live ledger is empty",
      input: {
        processMock: false,
        fromMode: "LIVE" as const,
        toMode: "PAPER" as const,
        paperLedgerQty: 0,
        liveLedgerQty: 0,
        kiteQty: -65,
      },
      ok: false,
    },
    {
      name: "allows switch when MOCK_ORDERS (same synthetic book)",
      input: {
        processMock: true,
        fromMode: "PAPER" as const,
        toMode: "LIVE" as const,
        paperLedgerQty: -130,
        liveLedgerQty: 0,
        kiteQty: 0,
      },
      ok: true,
    },
    {
      name: "allows switch when the from-book is flat",
      input: {
        processMock: false,
        fromMode: "PAPER" as const,
        toMode: "LIVE" as const,
        paperLedgerQty: 0,
        liveLedgerQty: 0,
        kiteQty: 0,
      },
      ok: true,
    },
    {
      name: "same mode is a no-op",
      input: {
        processMock: false,
        fromMode: "LIVE" as const,
        toMode: "LIVE" as const,
        paperLedgerQty: 0,
        liveLedgerQty: -65,
        kiteQty: 0,
      },
      ok: true,
    },
  ])("$name", ({ input, ok }) => {
    expect(chaseExecutionModeSwitchBlocked(input).ok).toBe(ok)
  })

  it("does not flip LONG/SHORT on signal_only, failed place, or placed-without-fill", () => {
    expect(chaseFillAllowsStatusFlip("signal_only")).toBe(false)
    expect(chaseFillAllowsStatusFlip("failed")).toBe(false)
    expect(chaseFillAllowsStatusFlip("wait")).toBe(false)
    expect(chaseFillAllowsStatusFlip("placed")).toBe(false)
    expect(chaseFillAllowsStatusFlip("filled")).toBe(true)
    expect(chaseFillFromDecision("signal_only")).toBe("signal_only")
  })

  it("requires matching book size before HOLD", () => {
    expect(chaseStatusHasPosition(CHASE_STATUS.SHORT, 0)).toBe(false)
    expect(chaseStatusHasPosition(CHASE_STATUS.SHORT, -130)).toBe(true)
    expect(chaseStatusHasPosition(CHASE_STATUS.LONG, -130)).toBe(false)
    expect(chaseStatusHasPosition(CHASE_STATUS.AWAITING_SIGNAL, -130)).toBe(false)
  })

  it("does not re-enter when LONG/SHORT is flat", () => {
    expect(
      decideChaseInPositionSync({ netQty: -65, side: "SHORT", hasOpenEntryOrder: false })
    ).toBe("hold")
    expect(
      decideChaseInPositionSync({ netQty: 0, side: "SHORT", hasOpenEntryOrder: true })
    ).toBe("wait_entry")
    expect(
      decideChaseInPositionSync({ netQty: 0, side: "SHORT", hasOpenEntryOrder: false })
    ).toBe("reset_empty")
  })
})
