import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material"
import { useEffect, useState } from "react"

import fetchJson from "../../lib/fetchJson"
import { RISK_STRATEGY_KEYS, type RiskSettings } from "../../lib/trading/riskEngine"

const LABELS: Record<(typeof RISK_STRATEGY_KEYS)[number], string> = {
  ATM_STRADDLE: "ATM Straddle",
  ATM_STRANGLE: "ATM Strangle",
  CHASE: "Chase",
}

function num(value: string, fallback: number) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export default function RiskControls({
  settings: initial,
  mockOrders,
  onSaved,
}: {
  settings: RiskSettings
  mockOrders: boolean
  onSaved: () => void
}) {
  const [settings, setSettings] = useState<RiskSettings>(initial)
  const [status, setStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSettings(initial)
  }, [initial])

  const save = async () => {
    setSaving(true)
    setStatus(null)
    try {
      await fetchJson("/api/desk/risk", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      })
      setStatus("Saved.")
      onSaved()
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack spacing={2} sx={{ p: 2 }}>
      <Typography variant="h6">Risk limits</Typography>
      <Typography color="text.secondary">
        These are the only trading risk controls. Change them here; they live in the database. .env
        is for infrastructure only (database, Redis, Kite keys, cookie secret, and MOCK_ORDERS for
        this process).
      </Typography>
      {mockOrders ? (
        <Alert severity="info">
          This process has MOCK_ORDERS=true, so Kite will not receive orders even if live is enabled
          below. That flag is deployment infrastructure, not a hidden strategy rule.
        </Alert>
      ) : null}

      <Paper sx={{ p: 2 }}>
        <Typography sx={{ fontWeight: 600, mb: 1 }}>Desk</Typography>
        <Stack spacing={1}>
          <FormControlLabel
            control={
              <Checkbox
                checked={settings.allowLiveOrders}
                onChange={e => setSettings({ ...settings, allowLiveOrders: e.target.checked })}
              />
            }
            label="Allow live orders (requires MOCK_ORDERS=false in .env)"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={settings.tradingEnabled}
                onChange={e => setSettings({ ...settings, tradingEnabled: e.target.checked })}
              />
            }
            label="Trading enabled"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={settings.requireMarketHours}
                onChange={e => setSettings({ ...settings, requireMarketHours: e.target.checked })}
              />
            }
            label="Reject new entries when the cash market is closed"
          />
          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              label="Max qty per order"
              type="number"
              size="small"
              value={settings.maxQtyPerOrder}
              onChange={e =>
                setSettings({ ...settings, maxQtyPerOrder: num(e.target.value, 1800) })
              }
            />
            <TextField
              label="Max notional (₹)"
              type="number"
              size="small"
              value={settings.maxNotionalInr}
              onChange={e =>
                setSettings({ ...settings, maxNotionalInr: num(e.target.value, 2_000_000) })
              }
            />
            <TextField
              label="Max working orders"
              type="number"
              size="small"
              value={settings.maxOpenOrders}
              onChange={e => setSettings({ ...settings, maxOpenOrders: num(e.target.value, 40) })}
            />
            <TextField
              label="Max orders / minute"
              type="number"
              size="small"
              value={settings.maxOrdersPerMinute}
              onChange={e =>
                setSettings({ ...settings, maxOrdersPerMinute: num(e.target.value, 20) })
              }
            />
          </Stack>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
            <TextField
              label="Stale price max age (sec)"
              type="number"
              size="small"
              value={settings.stalePriceMaxAgeSec}
              onChange={e =>
                setSettings({ ...settings, stalePriceMaxAgeSec: num(e.target.value, 30) })
              }
            />
            <TextField
              label="Minimum LTP"
              type="number"
              size="small"
              value={settings.minLtp}
              onChange={e => setSettings({ ...settings, minLtp: num(e.target.value, 0.05) })}
            />
          </Stack>
        </Stack>
      </Paper>

      {RISK_STRATEGY_KEYS.map(key => {
        const row = settings.strategies[key]
        return (
          <Paper key={key} sx={{ p: 2 }}>
            <Typography sx={{ fontWeight: 600, mb: 1 }}>{LABELS[key]}</Typography>
            <Typography color="text.secondary" sx={{ mb: 1 }}>
              Daily loss and drawdown use this strategy&apos;s book only. A straddle loss does not
              halt Chase, and the reverse.
            </Typography>
            <Stack spacing={1}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={row.enabled}
                    onChange={e =>
                      setSettings({
                        ...settings,
                        strategies: {
                          ...settings.strategies,
                          [key]: { ...row, enabled: e.target.checked },
                        },
                      })
                    }
                  />
                }
                label="Strategy enabled"
              />
              <FormControl size="small" sx={{ maxWidth: 360 }}>
                <InputLabel id={`exec-${key}`}>Execution</InputLabel>
                <Select
                  labelId={`exec-${key}`}
                  label="Execution"
                  value={row.executionMode ?? "PAPER"}
                  onChange={e =>
                    setSettings({
                      ...settings,
                      strategies: {
                        ...settings.strategies,
                        [key]: {
                          ...row,
                          executionMode: e.target.value === "LIVE" ? "LIVE" : "PAPER",
                        },
                      },
                    })
                  }
                >
                  <MenuItem value="PAPER">Paper — live quotes, no Kite order</MenuItem>
                  <MenuItem value="LIVE">Live — send to broker</MenuItem>
                </Select>
              </FormControl>
              {row.executionMode === "LIVE" ? (
                <Alert severity="warning">
                  Live also needs MOCK_ORDERS=false in the process and “Allow live orders” above.
                </Alert>
              ) : (
                <Typography color="text.secondary" variant="body2">
                  Paper fills the ledger at the order price / LTP. Positions and trade history keep
                  provenance PAPER (or MOCK if the whole process is MOCK_ORDERS=true).
                </Typography>
              )}
              <FormControlLabel
                control={
                  <Checkbox
                    checked={!row.halted}
                    onChange={e =>
                      setSettings({
                        ...settings,
                        strategies: {
                          ...settings.strategies,
                          [key]: {
                            ...row,
                            halted: !e.target.checked,
                            haltReason: e.target.checked ? null : row.haltReason,
                          },
                        },
                      })
                    }
                  />
                }
                label={
                  row.halted
                    ? `Halted${row.haltReason ? `: ${row.haltReason}` : ""} — uncheck to resume`
                    : "Not halted"
                }
              />
              <Stack direction={{ xs: "column", md: "row" }} spacing={1}>
                <TextField
                  label="Max lots"
                  type="number"
                  size="small"
                  value={row.maxLots}
                  onChange={e =>
                    setSettings({
                      ...settings,
                      strategies: {
                        ...settings.strategies,
                        [key]: { ...row, maxLots: num(e.target.value, 20) },
                      },
                    })
                  }
                />
                <TextField
                  label="Max daily loss (₹)"
                  type="number"
                  size="small"
                  value={row.maxDailyLossInr}
                  onChange={e =>
                    setSettings({
                      ...settings,
                      strategies: {
                        ...settings.strategies,
                        [key]: { ...row, maxDailyLossInr: num(e.target.value, 50_000) },
                      },
                    })
                  }
                />
                <TextField
                  label="Max drawdown (0–1)"
                  type="number"
                  size="small"
                  value={row.maxDrawdownPct}
                  onChange={e =>
                    setSettings({
                      ...settings,
                      strategies: {
                        ...settings.strategies,
                        [key]: { ...row, maxDrawdownPct: num(e.target.value, 0.15) },
                      },
                    })
                  }
                />
                <TextField
                  label="Max open positions"
                  type="number"
                  size="small"
                  value={row.maxOpenPositions}
                  onChange={e =>
                    setSettings({
                      ...settings,
                      strategies: {
                        ...settings.strategies,
                        [key]: { ...row, maxOpenPositions: num(e.target.value, 12) },
                      },
                    })
                  }
                />
              </Stack>
            </Stack>
          </Paper>
        )
      })}

      <Box>
        <Button variant="contained" disabled={saving} onClick={save}>
          {saving ? "Saving…" : "Save risk limits"}
        </Button>
      </Box>
      {status ? <Alert severity={status === "Saved." ? "success" : "error"}>{status}</Alert> : null}
    </Stack>
  )
}
