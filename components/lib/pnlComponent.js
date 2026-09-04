import Chip from "@mui/material/Chip"
import React from "react"

export default function PnLComponent({ pnl, points }) {
  const rupee = typeof pnl === "number" ? `₹${pnl.toFixed(2)}` : null
  const pts = typeof points === "number" ? `${points.toFixed(2)} pts` : null
  const label = [rupee, pts].filter(Boolean).join(" · ")
  const negative = typeof pnl === "number" ? pnl < 0 : false

  return (
    <Chip
      label={label || "P&L"}
      color={negative ? "error" : "success"}
      style={{ fontWeight: "bold" }}
    />
  )
}
