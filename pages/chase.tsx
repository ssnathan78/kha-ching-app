import { Alert, Button, Chip, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material"
import Link from "next/link"
import { useEffect, useState } from "react"

import Layout from "../components/Layout"
import ConfirmDialog from "../components/lib/ConfirmDialog"
import InstrumentPicker from "../components/lib/InstrumentPicker"
import { ChaseNotionalPreview } from "../components/lib/NotionalPreview"
import {
  CHASE_MASTER_DEFAULTS,
  CHASE_OPEN_CLASSIFY,
  type ChaseEngineConfig,
} from "../lib/chaseDefaults"
import { normalizeChaseOpenClassify } from "../lib/chaseOpenClassify"
import { INSTRUMENTS } from "../lib/constants"
import fetchJson, { type FetchJsonError } from "../lib/fetchJson"
import { useChaseSettings } from "../lib/hooks/useChaseSettings"
import useUser from "../lib/useUser"

const ChasePlanPage = () => {
  useUser({ redirectTo: "/" })
  const { data, error, mutate } = useChaseSettings()
  const [state, setState] = useState<ChaseEngineConfig>(CHASE_MASTER_DEFAULTS)
  const [status, setStatus] = useState("")
  const [resetOpen, setResetOpen] = useState(false)
  const [flattenOpen, setFlattenOpen] = useState(false)

  useEffect(() => {
    if (data?.config) {
      setState({ ...CHASE_MASTER_DEFAULTS, ...data.config })
    }
  }, [data])

  const save = async (patch: Partial<ChaseEngineConfig> = {}) => {
    const next = { ...state, ...patch }
    try {
      const saved = await fetchJson<{ config: ChaseEngineConfig }>("/api/chase-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: next }),
      })
      setState({ ...CHASE_MASTER_DEFAULTS, ...saved.config })
      setStatus("Saved.")
      await mutate()
    } catch (e) {
      const err = e as FetchJsonError
      setStatus((err.data as { error?: string })?.error || err.message || "Could not save.")
    }
  }

  const squareOffChase = async () => {
    setFlattenOpen(false)
    try {
      await fetchJson("/api/desk/flatten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy: "CHASE" }),
      })
      setStatus("Chase squared off. The next hourly job can take a fresh signal.")
      await mutate()
    } catch (e) {
      const err = e as FetchJsonError
      setStatus(
        (err.data as { error?: string })?.error || err.message || "Could not square off Chase."
      )
    }
  }

  const resetSignal = async () => {
    setResetOpen(false)
    try {
      await fetchJson("/api/chase-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset-signal" }),
      })
      setStatus(
        "Chase status reset to AWAITING_SIGNAL. The next hourly job can take a fresh signal."
      )
      await mutate()
    } catch (e) {
      const err = e as FetchJsonError
      setStatus(
        (err.data as { error?: string })?.error || err.message || "Could not reset Chase status."
      )
    }
  }

  if (error) {
    return (
      <Layout title="Chase">
        <Typography color="error">Could not load Chase settings.</Typography>
      </Layout>
    )
  }

  if (!data) {
    return <Layout title="Chase" loading />
  }

  return (
    <Layout title="Chase plan" maxWidth="md">
      <Typography variant="h5" component="h1">
        Chase
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
        Futures trend-follow around a long EMA. Pick one or more indexes — each runs its own Chase
        book. This is not a weekday template and it is not squared off with MIS straddles.
      </Typography>
      <Button component={Link} href="/help/chase" size="small" sx={{ mb: 2 }}>
        Chase guide
      </Button>

      <Paper sx={{ p: 2.5, mb: 2 }}>
        <Stack direction="row" spacing={1} sx={{ mb: 2, alignItems: "center", flexWrap: "wrap" }}>
          <Typography variant="h6">Trading</Typography>
          <Chip
            size="small"
            color={state.paused ? "warning" : "success"}
            label={state.paused ? "Paused — no new entries" : "Live — new entries allowed"}
          />
        </Stack>

        <Stack spacing={2}>
          <InstrumentPicker
            single={false}
            hint="Tick every index Chase should trade. Each index has its own futures book and signals."
            enabledInstruments={[INSTRUMENTS.NIFTY, INSTRUMENTS.BANKNIFTY, INSTRUMENTS.FINNIFTY]}
            instruments={{
              [INSTRUMENTS.NIFTY]: (state.instruments ?? ["NIFTY"]).includes(INSTRUMENTS.NIFTY),
              [INSTRUMENTS.BANKNIFTY]: (state.instruments ?? []).includes(INSTRUMENTS.BANKNIFTY),
              [INSTRUMENTS.FINNIFTY]: (state.instruments ?? []).includes(INSTRUMENTS.FINNIFTY),
            }}
            onChange={next =>
              setState({
                ...state,
                instruments: (Object.keys(next) as INSTRUMENTS[]).filter(key => next[key]),
              })
            }
          />
          <TextField
            label="Lots"
            type="number"
            size="small"
            fullWidth
            value={state.lots}
            onChange={e => setState({ ...state, lots: Number(e.target.value) })}
          />
          <ChaseNotionalPreview
            lots={state.lots}
            instruments={state.instruments}
            maxNotionalInr={data.notional?.maxNotionalInr ?? 0}
            priceByIndex={Object.fromEntries(
              (data.notional?.rows ?? []).map(row => [row.instrument, row.price])
            )}
          />
          <TextField
            label="EMA period"
            type="number"
            size="small"
            fullWidth
            value={state.emaPeriod}
            onChange={e => setState({ ...state, emaPeriod: Number(e.target.value) })}
          />
          <TextField
            label="Buffer %"
            type="number"
            size="small"
            fullWidth
            value={state.bufferPercent}
            onChange={e => setState({ ...state, bufferPercent: Number(e.target.value) })}
          />
          <TextField
            label="Entry limit offset"
            type="number"
            size="small"
            fullWidth
            value={state.entryLimitOffset}
            onChange={e => setState({ ...state, entryLimitOffset: Number(e.target.value) })}
          />
          <TextField
            select
            label="09:16 morning classify"
            size="small"
            fullWidth
            value={state.openClassify}
            onChange={e =>
              setState({
                ...state,
                openClassify: normalizeChaseOpenClassify(e.target.value),
              })
            }
            helperText="PDF uses the 09:16 candle close vs overnight hourly EMA. Legacy steps 40-EMA on a 60-minute bar (Anil port)."
          >
            <MenuItem value={CHASE_OPEN_CLASSIFY.PDF_0916}>PDF — 09:16 candle (default)</MenuItem>
            <MenuItem value={CHASE_OPEN_CLASSIFY.LEGACY_60M}>Legacy — 60-minute bar</MenuItem>
          </TextField>
        </Stack>

        <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: "wrap" }}>
          <Button variant="contained" onClick={() => save()}>
            Save
          </Button>
          <Button variant="outlined" onClick={() => save({ paused: !state.paused })}>
            {state.paused ? "Resume entries" : "Pause entries"}
          </Button>
          <Button color="warning" variant="contained" onClick={() => setFlattenOpen(true)}>
            Square off current
          </Button>
          <Button color="warning" variant="outlined" onClick={() => setResetOpen(true)}>
            Reset to fresh signal
          </Button>
        </Stack>
      </Paper>

      {status ? (
        <Alert
          severity={
            status.startsWith("Could") || status.includes("open book") ? "error" : "success"
          }
        >
          {status}
        </Alert>
      ) : null}

      <ConfirmDialog
        open={flattenOpen}
        title="Square off Chase?"
        message="This flattens the current Chase futures book and returns Chase to AWAITING_SIGNAL. The next hourly job can still take a new signal. It does not pause Chase or halt the desk."
        confirmLabel="Square off"
        confirmColor="warning"
        onConfirm={() => void squareOffChase()}
        onCancel={() => setFlattenOpen(false)}
      />
      <ConfirmDialog
        open={resetOpen}
        title="Reset Chase to a fresh signal?"
        message="This sets Chase back to AWAITING_SIGNAL and cancels a pending entry trigger. It does not flatten an open futures position. Use Square off when you want out of the current book."
        confirmLabel="Reset signal"
        confirmColor="warning"
        onConfirm={() => void resetSignal()}
        onCancel={() => setResetOpen(false)}
      />
    </Layout>
  )
}

export default ChasePlanPage
export { getServerSideProps } from "../lib/ssrPage"
