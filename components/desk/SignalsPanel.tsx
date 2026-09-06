import {
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material"

import type { FeedPeriod } from "../../lib/trading/feedWindow"
import type { SignalFilters, StrategySignal } from "../../lib/trading/signals"
import FeedToolbar from "./FeedToolbar"

function when(value: string | null | undefined) {
  if (!value) return "—"
  return new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
}

function outcomeColor(outcome: string) {
  if (outcome === "ENTER") return "success"
  if (outcome === "REJECT" || outcome === "INVALID") return "error"
  if (outcome === "WAIT" || outcome === "HOLD") return "info"
  if (outcome === "ADJUST") return "warning"
  return "default"
}

export default function SignalsPanel({
  signals,
  filters,
  period,
  strategy,
  planRef,
  jobId,
  onPeriod,
  onStrategy,
  onPlanRef,
  onJobId,
  onClear,
}: {
  signals: StrategySignal[]
  filters: SignalFilters
  period: FeedPeriod
  strategy: string
  planRef: string
  jobId: string
  onPeriod: (period: FeedPeriod) => void
  onStrategy: (value: string) => void
  onPlanRef: (value: string) => void
  onJobId: (value: string) => void
  onClear: (period: FeedPeriod) => void
}) {
  return (
    <Paper>
      <Typography variant="body2" color="text.secondary" sx={{ px: 2, pt: 2 }}>
        Persisted evaluations: Chase hourly EMA vs close, straddle skew samples, strangle strike
        picks. Filter by strategy, weekday plan, or a single job/trade.
      </Typography>
      <FeedToolbar
        period={period}
        onPeriod={onPeriod}
        onClear={onClear}
        extra={
          <>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Strategy</InputLabel>
              <Select label="Strategy" value={strategy} onChange={e => onStrategy(e.target.value)}>
                <MenuItem value="">All strategies</MenuItem>
                {filters.strategies.map(key => (
                  <MenuItem key={key} value={key}>
                    {key}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Plan</InputLabel>
              <Select label="Plan" value={planRef} onChange={e => onPlanRef(e.target.value)}>
                <MenuItem value="">All plans</MenuItem>
                {filters.planRefs.map(key => (
                  <MenuItem key={key} value={key}>
                    {key}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Trade / job</InputLabel>
              <Select label="Trade / job" value={jobId} onChange={e => onJobId(e.target.value)}>
                <MenuItem value="">All trades</MenuItem>
                {filters.jobs.map(job => (
                  <MenuItem key={job.id} value={job.id}>
                    {job.name || job.orderTag || job.id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </>
        }
      />
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>When (IST)</TableCell>
            <TableCell>Outcome</TableCell>
            <TableCell>Kind</TableCell>
            <TableCell>What the engine saw</TableCell>
            <TableCell>Strategy</TableCell>
            <TableCell>Instrument</TableCell>
            <TableCell>Trade</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {signals.map(row => (
            <TableRow key={row.id}>
              <TableCell>{when(row.occurredAt)}</TableCell>
              <TableCell>
                <Chip
                  size="small"
                  label={row.outcome}
                  color={outcomeColor(row.outcome)}
                  variant="outlined"
                />
              </TableCell>
              <TableCell>{row.kind}</TableCell>
              <TableCell>{row.summary}</TableCell>
              <TableCell>{row.strategy || "—"}</TableCell>
              <TableCell>{row.instrument || row.tradingsymbol || "—"}</TableCell>
              <TableCell>{row.jobName || row.orderTag || row.planRef || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {signals.length === 0 ? (
        <Typography sx={{ p: 2 }} color="text.secondary">
          No signals in this filter. Chase writes one row each hour (including “waiting for
          signal”). Straddle writes sampled skew waits plus the accept/reject.
        </Typography>
      ) : null}
    </Paper>
  )
}
