import { Alert, Button, Chip, Paper, Stack, TextField, Typography } from "@mui/material"
import Link from "next/link"
import React, { useEffect, useState } from "react"

import Layout from "../components/Layout"
import InstrumentPicker from "../components/lib/InstrumentPicker"
import { CHASE_MASTER_DEFAULTS, type ChaseEngineConfig } from "../lib/chaseDefaults"
import { INSTRUMENTS } from "../lib/constants"
import fetchJson, { type FetchJsonError } from "../lib/fetchJson"
import { useChaseSettings } from "../lib/hooks/useChaseSettings"
import useUser from "../lib/useUser"

const ChasePlanPage = () => {
  useUser({ redirectTo: "/" })
  const { data, error, mutate } = useChaseSettings()
  const [state, setState] = useState<ChaseEngineConfig>(CHASE_MASTER_DEFAULTS)
  const [status, setStatus] = useState("")

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
        <Stack direction="row" spacing={1} sx={{ mb: 2, alignItems: "center" }}>
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
            value={state.lots}
            onChange={e => setState({ ...state, lots: Number(e.target.value) })}
          />
          <TextField
            label="EMA period"
            type="number"
            size="small"
            value={state.emaPeriod}
            onChange={e => setState({ ...state, emaPeriod: Number(e.target.value) })}
          />
          <TextField
            label="Buffer %"
            type="number"
            size="small"
            value={state.bufferPercent}
            onChange={e => setState({ ...state, bufferPercent: Number(e.target.value) })}
          />
          <TextField
            label="Entry limit offset"
            type="number"
            size="small"
            value={state.entryLimitOffset}
            onChange={e => setState({ ...state, entryLimitOffset: Number(e.target.value) })}
          />
        </Stack>

        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button variant="contained" onClick={() => save()}>
            Save
          </Button>
          <Button variant="outlined" onClick={() => save({ paused: !state.paused })}>
            {state.paused ? "Resume entries" : "Pause entries"}
          </Button>
        </Stack>
      </Paper>

      {status ? <Alert severity={status === "Saved." ? "success" : "error"}>{status}</Alert> : null}
    </Layout>
  )
}

export default ChasePlanPage
export { getServerSideProps } from "../lib/ssrPage"
