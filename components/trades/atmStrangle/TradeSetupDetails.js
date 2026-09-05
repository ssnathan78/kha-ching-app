import dayjs from "dayjs"
import React from "react"

import { EXIT_STRATEGIES, STRANGLE_ENTRY_STRATEGIES } from "../../../lib/constants"
import { strangleEntryLabel } from "../../../lib/planLabels"
import commonDetailsRows from "../../lib/commonDetailsRows"
import OrdersTable from "../../lib/ordersTable"

const Details = args => {
  const {
    lots,
    instrument,
    inverted,
    entryStrategy,
    strategy,
    percentfromAtm,
    distanceFromAtm,
    optionPrice,
  } = args

  return (
    <OrdersTable
      rows={[
        [{ value: "Strategy" }, { value: strategy }],
        [{ value: "Instrument" }, { value: instrument }],
        [{ value: "Lots" }, { value: lots }],
        [{ value: "Strangle Type" }, { value: inverted ? "Inverted" : "Regular" }],
        [
          { value: "Entry strategy" },
          {
            value: strangleEntryLabel(entryStrategy),
          },
        ],
        entryStrategy === STRANGLE_ENTRY_STRATEGIES.PERCENT_FROM_ATM
          ? [{ value: "Percent from ATM" }, { value: percentfromAtm }]
          : entryStrategy === STRANGLE_ENTRY_STRATEGIES.ENTRY_PRICE
            ? [{ value: "Option Price" }, { value: optionPrice }]
            : [{ value: "Distance from ATM" }, { value: distanceFromAtm }],
        ...commonDetailsRows(args),
      ]}
    />
  )
}

export default Details
