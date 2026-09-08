import { Alert, Stack, TextField, Typography } from "@mui/material"
import { useMemo, useState } from "react"

import {
  chaseFuturesNotionalInr,
  formatInr,
  lotSizeForInstrument,
  notionalVsCap,
  optionStructureNotionalInr,
  selectedPlanInstruments,
} from "../../lib/trading/notional"

function CapAlert({
  overCap,
  notional,
  maxNotionalInr,
  children,
}: {
  overCap: boolean
  notional: number
  maxNotionalInr: number
  children: string
}) {
  if (!maxNotionalInr) {
    return (
      <Typography variant="body2" color="text.secondary">
        {children}
      </Typography>
    )
  }
  return (
    <Alert severity={overCap ? "error" : "info"}>
      {children}
      {overCap
        ? ` This is ₹${formatInr(notional - maxNotionalInr)} over the Desk max of ₹${formatInr(maxNotionalInr)}. Raise max notional on Desk → Risk, or reduce lots, before an order can go through.`
        : ` Desk max notional is ₹${formatInr(maxNotionalInr)}.`}
    </Alert>
  )
}

export function ChaseNotionalPreview({
  lots,
  instruments,
  priceByIndex,
  maxNotionalInr,
}: {
  lots: number
  instruments: string[]
  priceByIndex: Record<string, number | null | undefined>
  maxNotionalInr: number
}) {
  const rows = (instruments.length ? instruments : ["NIFTY"]).map(index => {
    const lotSize = lotSizeForInstrument(index)
    const price = priceByIndex[index] ?? null
    const qty = lots * lotSize
    const notional = price ? chaseFuturesNotionalInr({ lots, lotSize, price }) : 0
    return { index, lotSize, price, ...notionalVsCap(notional, maxNotionalInr, qty) }
  })
  const worst = rows.find(r => r.overCap) || rows[0]
  const text = rows
    .map(r =>
      r.price
        ? `${r.index}: ${lots} lot × ${r.lotSize} × ₹${formatInr(r.price)} = ₹${formatInr(r.notional)} (${r.qty} qty)`
        : `${r.index}: ${lots} lot × ${r.lotSize} = ${r.qty} qty (price unknown until the next hourly close / LTP)`
    )
    .join(". ")

  return (
    <CapAlert
      overCap={Boolean(worst?.overCap)}
      notional={worst?.notional ?? 0}
      maxNotionalInr={maxNotionalInr}
    >
      {text}
    </CapAlert>
  )
}

export function OptionNotionalPreview({
  lots,
  instruments,
  maxNotionalInr,
  legs = 2,
}: {
  lots: number
  instruments: Record<string, boolean> | string[]
  maxNotionalInr: number
  legs?: number
}) {
  const [premium, setPremium] = useState<string>("")
  const selected = Array.isArray(instruments) ? instruments : selectedPlanInstruments(instruments)
  const premiumN = Number(premium)
  const rows = useMemo(
    () =>
      selected.map(index => {
        const lotSize = lotSizeForInstrument(index)
        const qty = lots * lotSize
        const notional =
          premiumN > 0 ? optionStructureNotionalInr({ lots, lotSize, premium: premiumN, legs }) : 0
        return { index, lotSize, ...notionalVsCap(notional, maxNotionalInr, qty * legs) }
      }),
    [selected, lots, premiumN, maxNotionalInr, legs]
  )
  const worst = rows.find(r => r.overCap) || rows[0]
  const text =
    rows.length === 0
      ? "Tick an index to see quantity and notional."
      : rows
          .map(r =>
            premiumN > 0
              ? `${r.index}: ${lots} lot × ${r.lotSize} × ${legs} legs × ₹${formatInr(premiumN)} = ₹${formatInr(r.notional)}`
              : `${r.index}: ${lots} lot × ${r.lotSize} × ${legs} legs = ${r.qty} qty. Enter an estimated premium to compare with the Desk cap.`
          )
          .join(". ")

  return (
    <Stack spacing={1} sx={{ mt: 1 }}>
      <TextField
        size="small"
        type="number"
        label="Est. premium (₹, preview only)"
        value={premium}
        onChange={e => setPremium(e.target.value)}
        helperText="Not saved. Used to preview notional vs Desk → Risk max notional. Punch still uses live LTP."
      />
      <CapAlert
        overCap={Boolean(worst?.overCap && premiumN > 0)}
        notional={worst?.notional ?? 0}
        maxNotionalInr={maxNotionalInr}
      >
        {text}
      </CapAlert>
    </Stack>
  )
}
