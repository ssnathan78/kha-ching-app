import {
  Alert,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material"

import type { DeskInstrumentSnapshot } from "../../lib/trading/deskInstruments"

function contract(row: { tradingsymbol: string; expiry: string; lotSize: number } | null) {
  if (!row) return "—"
  return `${row.tradingsymbol}  ·  ${row.expiry}  ·  lot ${row.lotSize}`
}

export default function ContractsPanel({ data }: { data: DeskInstrumentSnapshot | undefined }) {
  if (!data) {
    return (
      <Typography sx={{ p: 2 }} color="text.secondary">
        Loading contract book…
      </Typography>
    )
  }

  return (
    <Stack spacing={2}>
      <Alert severity={data.kiteError ? "warning" : "info"}>{data.cacheNote}</Alert>
      {data.kiteError ? (
        <Alert severity="error">Kite instrument dump failed: {data.kiteError}</Alert>
      ) : null}
      <Paper sx={{ p: 2 }}>
        <Typography sx={{ fontWeight: 600, mb: 1 }}>Chase engine</Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", mb: 1 }}>
          <Chip size="small" label={`Lots ${data.chase.lots}`} />
          <Chip size="small" label={data.chase.paused ? "Paused" : "Running"} />
          <Chip size="small" label={`EMA ${data.chase.emaPeriod}`} />
          <Chip size="small" label={`Buffer ${data.chase.bufferPercent}%`} />
          <Chip size="small" label={`Entry offset ₹${data.chase.entryLimitOffset}`} />
          <Chip size="small" label={`Indexes ${data.chase.instruments.join(", ") || "—"}`} />
        </Stack>
        <Typography color="text.secondary" variant="body2">
          Chase trades index futures, not options. Front-month FUT is used until expiry day; new
          entries then roll to next month so a flat book does not open the dying contract.
        </Typography>
      </Paper>

      <Paper>
        <Typography sx={{ fontWeight: 600, p: 2, pb: 0 }}>
          Index contracts {data.source === "KITE_NFO" ? "(from Kite NFO)" : "(static lots only)"}
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Index</TableCell>
              <TableCell>Chase</TableCell>
              <TableCell>Front FUT</TableCell>
              <TableCell>Next FUT</TableCell>
              <TableCell>Chase entry today</TableCell>
              <TableCell>Option expiries</TableCell>
              <TableCell>Lot / step</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.indexes.map(row => (
              <TableRow key={row.index}>
                <TableCell>
                  {row.displayName}
                  <Typography variant="caption" display="block" color="text.secondary">
                    {row.underlyingSymbol}
                    {row.hasWeeklyExpiry ? " · weekly options" : ""}
                  </Typography>
                </TableCell>
                <TableCell>
                  {row.chaseEnabled ? row.chaseStatus || "on" : "off"}
                  {row.chaseTradingsymbol ? (
                    <Typography variant="caption" display="block" color="text.secondary">
                      book {row.chaseTradingsymbol}
                      {row.chaseStoploss != null ? ` · SL ${row.chaseStoploss}` : ""}
                    </Typography>
                  ) : null}
                </TableCell>
                <TableCell>{contract(row.frontFut)}</TableCell>
                <TableCell>{contract(row.nextFut)}</TableCell>
                <TableCell>{contract(row.chaseNewEntry)}</TableCell>
                <TableCell>
                  {row.optionCurrentExpiry ? `current ${row.optionCurrentExpiry}` : "—"}
                  {row.optionNextExpiry ? (
                    <Typography variant="caption" display="block">
                      next {row.optionNextExpiry}
                    </Typography>
                  ) : null}
                  {row.optionMonthlyExpiry ? (
                    <Typography variant="caption" display="block">
                      monthly {row.optionMonthlyExpiry}
                    </Typography>
                  ) : null}
                </TableCell>
                <TableCell>
                  {row.frontFut?.lotSize || row.lotSize} / {row.strikeStepSize}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
      <Typography color="text.secondary" variant="body2">
        Straddle and strangle pick CE/PE symbols at punch time from the same NFO dump (current /
        next / monthly expiry on the plan). Those option symbols are not stored until a job actually
        places.
      </Typography>
    </Stack>
  )
}
