import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material"
import { useState } from "react"
import useSWR from "swr"
import RiskControls from "../components/desk/RiskControls"
import Layout from "../components/Layout"
import ConfirmDialog from "../components/lib/ConfirmDialog"
import fetchJson from "../lib/fetchJson"
import { DEFAULT_RISK_SETTINGS } from "../lib/trading/riskEngine"
import useUser from "../lib/useUser"

function money(value: string | number | null | undefined) {
  if (value == null || value === "") return "—"
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 })
}

function istYmd(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d)
}

function rangeForPreset(preset: string): { from?: string; to?: string } {
  const today = istYmd()
  const [y, m] = today.split("-").map(Number)
  const pad = (n: number) => String(n).padStart(2, "0")
  if (preset === "month") {
    return { from: `${y}-${pad(m)}-01`, to: `${today}T23:59:59+05:30` }
  }
  if (preset === "quarter") {
    const qStart = Math.floor((m - 1) / 3) * 3 + 1
    return { from: `${y}-${pad(qStart)}-01`, to: `${today}T23:59:59+05:30` }
  }
  if (preset === "year") {
    return { from: `${y}-01-01`, to: `${today}T23:59:59+05:30` }
  }
  return {}
}

function when(value: string | Date | null | undefined) {
  if (!value) return "—"
  return new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
}

export default function DeskPage() {
  const { user } = useUser({ redirectTo: "/" })
  const [tab, setTab] = useState(0)
  const [reconciling, setReconciling] = useState(false)
  const [reconMsg, setReconMsg] = useState<string | null>(null)
  const [resumeOpen, setResumeOpen] = useState(false)
  const [riskBusy, setRiskBusy] = useState(false)
  const [tradeBook, setTradeBook] = useState<"ALL" | "PAPER" | "LIVE">("ALL")
  const [tradePreset, setTradePreset] = useState<"all" | "month" | "quarter" | "year" | "custom">(
    "all"
  )
  const [tradeFrom, setTradeFrom] = useState("")
  const [tradeTo, setTradeTo] = useState("")

  const { data: portfolioData, mutate: mutatePortfolio } = useSWR(
    user?.isLoggedIn ? "/api/desk/portfolio" : null
  )
  const bookQs = tradeBook === "ALL" ? "" : `?book=${tradeBook}`
  const { data: positionData } = useSWR(user?.isLoggedIn ? `/api/desk/positions${bookQs}` : null)
  const { data: orderData } = useSWR(user?.isLoggedIn ? `/api/desk/orders${bookQs}` : null)
  const tradeRange =
    tradePreset === "custom"
      ? {
          from: tradeFrom ? `${tradeFrom}T00:00:00+05:30` : undefined,
          to: tradeTo ? `${tradeTo}T23:59:59+05:30` : undefined,
        }
      : rangeForPreset(tradePreset)
  const tradeQuery = new URLSearchParams()
  if (tradeBook !== "ALL") tradeQuery.set("book", tradeBook)
  if (tradeRange.from) tradeQuery.set("from", tradeRange.from)
  if (tradeRange.to) tradeQuery.set("to", tradeRange.to)
  const tradeQs = tradeQuery.toString()
  const { data: tradeData } = useSWR(
    user?.isLoggedIn ? `/api/desk/trades${tradeQs ? `?${tradeQs}` : ""}` : null
  )
  const { data: activityData } = useSWR(user?.isLoggedIn ? "/api/desk/activity" : null)
  const { data: riskData, mutate: mutateRisk } = useSWR(user?.isLoggedIn ? "/api/desk/risk" : null)

  if (!user?.isLoggedIn) {
    return <Layout title="Desk" loading />
  }

  const p = portfolioData?.portfolio
  const sessions = portfolioData?.sessions ?? []
  const positions = positionData?.positions ?? []
  const orders = orderData?.orders ?? []
  const trades = tradeData?.trades ?? []
  const audit = activityData?.audit ?? []
  const decisions = activityData?.decisions ?? []
  const recon = activityData?.recon ?? []
  const risk = riskData?.settings
  const deskHalted = Boolean(risk?.deskHalted)

  return (
    <Layout title="Desk" maxWidth="xl">
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        sx={{ mb: 2, alignItems: { md: "center" } }}
      >
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5">Trading desk</Typography>
          <Typography color="text.secondary">
            Ledger view of orders, positions, round-trips, and why they happened. Kite remains live
            execution reality; this page is the application record.
          </Typography>
        </Box>
        {deskHalted ? (
          <Button
            color="warning"
            variant="contained"
            disabled={riskBusy}
            onClick={() => setResumeOpen(true)}
          >
            Resume trading
          </Button>
        ) : (
          <Button
            color="error"
            variant="outlined"
            disabled={riskBusy}
            onClick={async () => {
              setRiskBusy(true)
              try {
                await fetchJson("/api/desk/risk", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "halt", reason: "Manual halt from desk" }),
                })
                await mutateRisk()
              } catch (e) {
                setReconMsg(e instanceof Error ? e.message : "Halt failed")
              } finally {
                setRiskBusy(false)
              }
            }}
          >
            Halt new entries
          </Button>
        )}
        <Button
          variant="outlined"
          disabled={reconciling}
          onClick={async () => {
            setReconciling(true)
            setReconMsg(null)
            try {
              const result = await fetchJson<{
                appliedFills: number
                brokerOrdersSeen: number
                mismatches: number
              }>("/api/desk/reconcile", { method: "POST" })
              setReconMsg(
                `Reconciled: ${result.appliedFills} fills applied, ${result.brokerOrdersSeen} broker orders, ${result.mismatches} mismatches`
              )
              await mutatePortfolio()
            } catch (e) {
              setReconMsg(e instanceof Error ? e.message : "Reconcile failed")
            } finally {
              setReconciling(false)
            }
          }}
        >
          {reconciling ? "Reconciling…" : "Reconcile with broker"}
        </Button>
      </Stack>
      {reconMsg ? (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setReconMsg(null)}>
          {reconMsg}
        </Alert>
      ) : null}
      <ConfirmDialog
        open={resumeOpen}
        title="Resume trading?"
        message="This clears the desk halt and allows new entries again. Flatten and stop-loss orders were still allowed while halted. Resume only after you have reviewed positions."
        confirmLabel="Resume"
        confirmColor="warning"
        onCancel={() => setResumeOpen(false)}
        onConfirm={async () => {
          setResumeOpen(false)
          setRiskBusy(true)
          try {
            await fetchJson("/api/desk/risk", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "resume" }),
            })
            await mutateRisk()
          } catch (e) {
            setReconMsg(e instanceof Error ? e.message : "Resume failed")
          } finally {
            setRiskBusy(false)
          }
        }}
      />

      <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap" }}>
        <Chip
          label={deskHalted ? `Halted: ${risk?.haltReason || "desk stopped"}` : "Risk engine armed"}
          color={deskHalted ? "error" : "success"}
          variant={deskHalted ? "filled" : "outlined"}
        />
        <Chip label={`Portfolio ${money(p?.portfolioValue)}`} color="primary" variant="outlined" />
        <Chip label={`Cash ${money(p?.availableCash)}`} variant="outlined" />
        <Chip label={`Realized ${money(p?.realizedPnl)}`} variant="outlined" />
        <Chip label={`Unrealized ${money(p?.unrealizedPnl)}`} variant="outlined" />
        <Chip label={`Gross exposure ${money(p?.grossExposure)}`} variant="outlined" />
        <Chip label={`Drawdown ${money(p?.drawdown)}`} variant="outlined" />
        <Chip label={`Open ${p?.openPositionCount ?? 0}`} variant="outlined" />
      </Stack>

      <Paper sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable">
          <Tab label="Positions" />
          <Tab label="Orders" />
          <Tab label="Trades" />
          <Tab label="Decisions" />
          <Tab label="Activity" />
          <Tab label="Sessions" />
          <Tab label="Risk" />
        </Tabs>
      </Paper>

      {tab === 0 || tab === 1 || tab === 2 ? (
        <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ mb: 1.5 }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Book</InputLabel>
            <Select
              label="Book"
              value={tradeBook}
              onChange={e => setTradeBook(e.target.value as typeof tradeBook)}
            >
              <MenuItem value="ALL">All books</MenuItem>
              <MenuItem value="PAPER">Paper / mock</MenuItem>
              <MenuItem value="LIVE">Live / recon</MenuItem>
            </Select>
          </FormControl>
          {tab === 2 ? (
            <>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Period</InputLabel>
                <Select
                  label="Period"
                  value={tradePreset}
                  onChange={e => setTradePreset(e.target.value as typeof tradePreset)}
                >
                  <MenuItem value="all">All time</MenuItem>
                  <MenuItem value="month">This month</MenuItem>
                  <MenuItem value="quarter">This quarter</MenuItem>
                  <MenuItem value="year">This year</MenuItem>
                  <MenuItem value="custom">Custom</MenuItem>
                </Select>
              </FormControl>
              {tradePreset === "custom" ? (
                <>
                  <TextField
                    size="small"
                    type="date"
                    label="From"
                    slotProps={{ inputLabel: { shrink: true } }}
                    value={tradeFrom}
                    onChange={e => setTradeFrom(e.target.value)}
                  />
                  <TextField
                    size="small"
                    type="date"
                    label="To"
                    slotProps={{ inputLabel: { shrink: true } }}
                    value={tradeTo}
                    onChange={e => setTradeTo(e.target.value)}
                  />
                </>
              ) : null}
            </>
          ) : null}
        </Stack>
      ) : null}

      {tab === 0 ? (
        <Paper>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Symbol</TableCell>
                <TableCell>Product</TableCell>
                <TableCell>Strategy</TableCell>
                <TableCell>Book</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell align="right">Avg</TableCell>
                <TableCell align="right">Mark</TableCell>
                <TableCell align="right">Unrealized</TableCell>
                <TableCell align="right">Realized</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {positions.map((row: Record<string, unknown>) => (
                <TableRow key={String(row.id)}>
                  <TableCell>{String(row.tradingsymbol)}</TableCell>
                  <TableCell>{String(row.product || "—")}</TableCell>
                  <TableCell>{String(row.strategy || "—")}</TableCell>
                  <TableCell>{String(row.provenance || "—")}</TableCell>
                  <TableCell align="right">{String(row.quantity)}</TableCell>
                  <TableCell align="right">{money(row.averageEntryPrice as string)}</TableCell>
                  <TableCell align="right">{money(row.markPrice as string)}</TableCell>
                  <TableCell align="right">{money(row.unrealizedPnl as string)}</TableCell>
                  <TableCell align="right">{money(row.realizedPnl as string)}</TableCell>
                  <TableCell>{String(row.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {positions.length === 0 ? (
            <Typography sx={{ p: 2 }} color="text.secondary">
              No positions in the ledger yet. Punch a trade or run Reconcile.
            </Typography>
          ) : null}
        </Paper>
      ) : null}

      {tab === 1 ? (
        <Paper>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>When</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Side</TableCell>
                <TableCell>Symbol</TableCell>
                <TableCell align="right">Filled / Qty</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Purpose</TableCell>
                <TableCell>Book</TableCell>
                <TableCell>Tag</TableCell>
                <TableCell>Broker id</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orders.map((row: Record<string, unknown>) => (
                <TableRow key={String(row.id)}>
                  <TableCell>{when(row.createdAt as string)}</TableCell>
                  <TableCell>{String(row.status)}</TableCell>
                  <TableCell>{String(row.side)}</TableCell>
                  <TableCell>{String(row.tradingsymbol)}</TableCell>
                  <TableCell align="right">
                    {String(row.filledQty)} / {String(row.requestedQty)}
                  </TableCell>
                  <TableCell>{String(row.orderType || "—")}</TableCell>
                  <TableCell>{String(row.purpose)}</TableCell>
                  <TableCell>{String(row.provenance || "—")}</TableCell>
                  <TableCell>{String(row.orderTag || "—")}</TableCell>
                  <TableCell>{String(row.brokerOrderId || "—")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      ) : null}

      {tab === 2 ? (
        <Paper>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Entry</TableCell>
                <TableCell>Exit</TableCell>
                <TableCell>Symbol</TableCell>
                <TableCell>Dir</TableCell>
                <TableCell>Strategy</TableCell>
                <TableCell>Book</TableCell>
                <TableCell align="right">Entry / Exit qty</TableCell>
                <TableCell align="right">Avg in / out</TableCell>
                <TableCell align="right">Net P&L</TableCell>
                <TableCell>Exit reason</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {trades.map((row: Record<string, unknown>) => (
                <TableRow key={String(row.id)}>
                  <TableCell>{when(row.entryAt as string)}</TableCell>
                  <TableCell>{when(row.exitAt as string)}</TableCell>
                  <TableCell>{String(row.tradingsymbol)}</TableCell>
                  <TableCell>{String(row.direction)}</TableCell>
                  <TableCell>{String(row.strategy || "—")}</TableCell>
                  <TableCell>{String(row.provenance || "—")}</TableCell>
                  <TableCell align="right">
                    {String(row.entryQty)} / {String(row.exitQty)}
                  </TableCell>
                  <TableCell align="right">
                    {money(row.averageEntry as string)} / {money(row.averageExit as string)}
                  </TableCell>
                  <TableCell align="right">{money(row.netPnl as string)}</TableCell>
                  <TableCell>{String(row.exitReason || "—")}</TableCell>
                  <TableCell>{String(row.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      ) : null}

      {tab === 3 ? (
        <Paper>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>When</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Strategy</TableCell>
                <TableCell>Symbol</TableCell>
                <TableCell>Risk</TableCell>
                <TableCell>Reason</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {decisions.map((row: Record<string, unknown>) => (
                <TableRow key={String(row.id)}>
                  <TableCell>{when(row.occurredAt as string)}</TableCell>
                  <TableCell>{String(row.action)}</TableCell>
                  <TableCell>{String(row.strategy || "—")}</TableCell>
                  <TableCell>{String(row.tradingsymbol || row.instrument || "—")}</TableCell>
                  <TableCell>{String(row.riskResult || "—")}</TableCell>
                  <TableCell>{String(row.reason || row.intent || "—")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      ) : null}

      {tab === 4 ? (
        <Stack spacing={2}>
          <Paper>
            <Typography variant="subtitle2" sx={{ p: 1.5 }}>
              Audit
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>Event</TableCell>
                  <TableCell>Actor</TableCell>
                  <TableCell>Summary</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {audit.map((row: Record<string, unknown>) => (
                  <TableRow key={String(row.id)}>
                    <TableCell>{when(row.occurredAt as string)}</TableCell>
                    <TableCell>{String(row.eventType)}</TableCell>
                    <TableCell>{String(row.actor)}</TableCell>
                    <TableCell>{String(row.summary || "—")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
          <Paper>
            <Typography variant="subtitle2" sx={{ p: 1.5 }}>
              Reconciliation
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>Kind</TableCell>
                  <TableCell>Symbol</TableCell>
                  <TableCell>Detail</TableCell>
                  <TableCell>Resolved</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {recon.map((row: Record<string, unknown>) => (
                  <TableRow key={String(row.id)}>
                    <TableCell>{when(row.occurredAt as string)}</TableCell>
                    <TableCell>{String(row.kind)}</TableCell>
                    <TableCell>{String(row.tradingsymbol || "—")}</TableCell>
                    <TableCell>{String(row.detail || "—")}</TableCell>
                    <TableCell>{row.resolved ? "yes" : "no"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </Stack>
      ) : null}

      {tab === 5 ? (
        <Paper>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date (IST)</TableCell>
                <TableCell align="right">Net P&L</TableCell>
                <TableCell align="right">Fees</TableCell>
                <TableCell align="right">Trades</TableCell>
                <TableCell align="right">Wins</TableCell>
                <TableCell align="right">Win rate</TableCell>
                <TableCell align="right">Drawdown</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sessions.map((row: Record<string, unknown>) => (
                <TableRow key={String(row.sessionDate)}>
                  <TableCell>{String(row.sessionDate)}</TableCell>
                  <TableCell align="right">{money(row.netPnl as string)}</TableCell>
                  <TableCell align="right">{money(row.fees as string)}</TableCell>
                  <TableCell align="right">{String(row.tradeCount)}</TableCell>
                  <TableCell align="right">{String(row.winCount)}</TableCell>
                  <TableCell align="right">{money(row.winRate as string)}</TableCell>
                  <TableCell align="right">{money(row.maxDrawdown as string)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      ) : null}

      {tab === 6 ? (
        <Paper>
          <RiskControls
            settings={risk ?? DEFAULT_RISK_SETTINGS}
            mockOrders={Boolean(riskData?.mockOrders)}
            onSaved={() => mutateRisk()}
          />
        </Paper>
      ) : null}
    </Layout>
  )
}

export { getServerSideProps } from "../lib/ssrPage"
