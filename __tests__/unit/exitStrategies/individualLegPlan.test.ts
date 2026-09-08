import {
  planIndividualLegStops,
  remainingStopsAfterLegExit,
} from "../../../lib/exit-strategies/individualLegPlan"

const CE = "NIFTY25SEP25000CE"
const PE = "NIFTY25SEP25000PE"

describe("9:20 per-leg stop plan", () => {
  it("places an independent BUY stop on each short fill", () => {
    const stops = planIndividualLegStops(
      [
        {
          tradingsymbol: CE,
          transaction_type: "SELL",
          average_price: 100,
          quantity: 130,
        },
        {
          tradingsymbol: PE,
          transaction_type: "SELL",
          average_price: 100,
          quantity: 130,
        },
      ],
      15
    )
    expect(stops).toEqual([
      { tradingsymbol: CE, transaction_type: "BUY", trigger_price: 115, quantity: 130 },
      { tradingsymbol: PE, transaction_type: "BUY", trigger_price: 115, quantity: 130 },
    ])
  })

  it("leaves the other stop when one leg exits", () => {
    const stops = planIndividualLegStops(
      [
        {
          tradingsymbol: CE,
          transaction_type: "SELL",
          average_price: 120,
          quantity: 65,
        },
        {
          tradingsymbol: PE,
          transaction_type: "SELL",
          average_price: 80,
          quantity: 65,
        },
      ],
      30
    )
    expect(remainingStopsAfterLegExit(stops, CE)).toEqual([
      { tradingsymbol: PE, transaction_type: "BUY", trigger_price: 104, quantity: 65 },
    ])
  })
})
