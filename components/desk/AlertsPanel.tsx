import {
  Alert,
  Chip,
  Link as MuiLink,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material"
import NextLink from "next/link"

import type { FeedPeriod } from "../../lib/trading/feedWindow"
import FeedToolbar from "./FeedToolbar"

type OperatorAlert = {
  id: string
  occurredAt: string
  severity: "ERROR" | "WARN" | "INFO"
  source: string
  code: string
  summary: string
  strategy?: string | null
  instrument?: string | null
  jobId?: string | null
}

function when(value: string | null | undefined) {
  if (!value) return "—"
  return new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
}

export default function AlertsPanel({
  alerts,
  errorCount,
  warnCount,
  period,
  onPeriod,
  onClear,
}: {
  alerts: OperatorAlert[]
  errorCount: number
  warnCount: number
  period: FeedPeriod
  onPeriod: (period: FeedPeriod) => void
  onClear: (period: FeedPeriod) => void
}) {
  return (
    <Paper>
      <Typography variant="body2" color="text.secondary" sx={{ px: 2, pt: 2 }}>
        Failures that never became a Kite or ledger order (market closed, risk block, stale job,
        Chase data miss) plus broker rejects. Orders tab stays the blotter.
      </Typography>
      <FeedToolbar period={period} onPeriod={onPeriod} onClear={onClear} />
      {errorCount + warnCount > 0 ? (
        <Alert severity={errorCount ? "error" : "warning"} sx={{ mx: 2, mt: 1.5 }}>
          {errorCount} error{errorCount === 1 ? "" : "s"}
          {warnCount ? ` · ${warnCount} warning${warnCount === 1 ? "" : "s"}` : ""} in this view
        </Alert>
      ) : null}
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>When (IST)</TableCell>
            <TableCell>Severity</TableCell>
            <TableCell>Source</TableCell>
            <TableCell>Code</TableCell>
            <TableCell>What happened</TableCell>
            <TableCell>Strategy</TableCell>
            <TableCell>Instrument</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {alerts.map(row => (
            <TableRow key={row.id}>
              <TableCell>{when(row.occurredAt)}</TableCell>
              <TableCell>
                <Chip
                  size="small"
                  label={row.severity}
                  color={
                    row.severity === "ERROR"
                      ? "error"
                      : row.severity === "WARN"
                        ? "warning"
                        : "default"
                  }
                  variant="outlined"
                />
              </TableCell>
              <TableCell>{row.source}</TableCell>
              <TableCell>{row.code}</TableCell>
              <TableCell>{row.summary}</TableCell>
              <TableCell>{row.strategy || "—"}</TableCell>
              <TableCell>{row.instrument || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {alerts.length === 0 ? (
        <Typography sx={{ p: 2 }} color="text.secondary">
          No operator alerts. A rejected “Schedule now” on a Sunday or a live punch that never
          reached Kite will show up here, not under Orders. Today’s job cards stay on{" "}
          <MuiLink component={NextLink} href="/dashboard?tabId=0">
            Dashboard
          </MuiLink>
          .
        </Typography>
      ) : null}
    </Paper>
  )
}
