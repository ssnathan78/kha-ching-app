import { DeleteForever, Stop } from "@mui/icons-material"
import { Box, Button, Grid, Paper, Typography } from "@mui/material"
import dayjs from "dayjs"
import router from "next/router"
import type React from "react"
import { useState } from "react"
import useSWR, { mutate } from "swr"

import { STRATEGIES_DETAILS, USER_OVERRIDE } from "../lib/constants"
import { dashboardJobActions, isJobAborted } from "../lib/dashboardJobActions"
import fetchJson, { type FetchJsonError } from "../lib/fetchJson"
import BrokerOrders from "./lib/brokerOrders"
import ConfirmDialog from "./lib/ConfirmDialog"
import PnLComponent from "./lib/pnlComponent"
import TradeDetails from "./lib/tradeDetails"
import { useSnackbar } from "./lib/useSnackbar"

const HeadingWithError = ({ heading, error }: { heading?: string; error: string }) => (
  <>
    <Typography component="p" color="error">
      {error}
    </Typography>
    <Typography component="p">{heading}</Typography>
  </>
)

type TradeJob = {
  id: string
  strategy: string
  status?: string
  name?: string
  orderTag?: string
  status_message?: string
  userOverride?: string | null
  user_override?: string | null
  queue?: { id?: string }
  detailsComponent: (strategy: string, jobDetails: unknown) => React.ReactNode
}

const WrapperComponent = (props: TradeJob) => {
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [stopLoading, setStopLoading] = useState(false)
  const { showMessage, SnackbarAlert } = useSnackbar()

  const isChase = props.strategy === "SUBSCRIBE_CHASE"
  const jobWasQueued = props.status !== "REJECT" && props.queue?.id
  const { data: jobDetails } = useSWR(
    jobWasQueued && !isChase ? `/api/get_job?id=${props.queue?.id}` : null
  )

  const { data: jobOrders } = useSWR(
    props.orderTag ? `/api/get_orders?order_tag=${props.orderTag}` : null
  )

  const { data: pnlData } = useSWR(props.orderTag ? `/api/pnl?order_tag=${props.orderTag}` : null)

  const strategyDetails = STRATEGIES_DETAILS[props.strategy as keyof typeof STRATEGIES_DETAILS]
  const aborted = isJobAborted(props)

  const Heading = () => {
    if (isChase) {
      return <Typography component="p">Chase · Scheduled</Typography>
    }

    if (aborted) {
      return (
        <Typography component="p">Stopped · {props.name || strategyDetails?.heading}</Typography>
      )
    }

    if (!jobWasQueued) {
      if (typeof props.status_message === "string") {
        return <HeadingWithError error={props.status_message} heading={strategyDetails?.heading} />
      }
      return <HeadingWithError error="Unknown Error" heading={strategyDetails?.heading} />
    }

    if (jobWasQueued && (jobDetails as { current_state?: string })?.current_state === "failed") {
      return (
        <HeadingWithError
          error={(jobDetails as { job?: { failedReason?: string } })?.job?.failedReason || "Failed"}
          heading={strategyDetails?.heading}
        />
      )
    }

    return (
      <Typography component="p">
        #{props.queue?.id} · {props.name}
      </Typography>
    )
  }

  const handleDeleteTrade = async (tradeId: string) => {
    try {
      await fetchJson("/api/trades_day", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tradeId }),
      })
      await mutate("/api/trades_day")
    } catch (e) {
      const err = e as FetchJsonError
      showMessage(
        (err.data as { error?: string })?.error || err.message || "Could not delete job",
        "error"
      )
    }
  }

  const handleAbortTrade = async (tradeId: string) => {
    try {
      await fetchJson("/api/trades_day", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: tradeId,
          userOverride: USER_OVERRIDE.ABORT,
          user_override: USER_OVERRIDE.ABORT,
        }),
      })
      await mutate("/api/trades_day")
    } catch (e) {
      const err = e as FetchJsonError
      showMessage(
        (err.data as { error?: string })?.error || err.message || "Could not stop job",
        "error"
      )
    }
  }

  const { showDelete, showStop } = dashboardJobActions({
    jobWasQueued: Boolean(jobWasQueued),
    isChase,
    jobState: (jobDetails as { current_state?: string })?.current_state,
    jobMissing: (jobDetails as { error?: string })?.error === "job not found",
    aborted,
    hasSettledPnl: typeof (pnlData as { pnl?: number })?.pnl === "number",
  })

  return (
    <Paper sx={{ mb: 2.5, p: 2.5 }}>
      {SnackbarAlert}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 2,
          minHeight: 36,
        }}
      >
        <Typography sx={{ mr: 1 }}>
          <Heading />
        </Typography>
        <Box>
          {showDelete ? (
            <Button
              variant="outlined"
              loading={deleteLoading}
              onClick={async () => {
                setDeleteLoading(true)
                await handleDeleteTrade(props.id)
                setDeleteLoading(false)
              }}
              sx={{ mr: 1 }}
            >
              <DeleteForever />
              Delete
            </Button>
          ) : null}
          {showStop ? (
            <Button
              variant="outlined"
              color="inherit"
              loading={stopLoading}
              onClick={async () => {
                setStopLoading(true)
                await handleAbortTrade(props.id)
                setStopLoading(false)
              }}
            >
              <Stop /> Stop
            </Button>
          ) : null}
        </Box>
      </Box>

      <Box sx={{ mb: 2 }}>{props.detailsComponent(props.strategy, jobDetails)}</Box>

      {jobWasQueued && !isChase ? (
        <Box sx={{ mb: 1 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Typography variant="subtitle2">
              Live status —{" "}
              {(jobDetails as { current_state?: string })?.current_state?.toUpperCase() ||
                (jobDetails as { error?: string })?.error ||
                "Loading..."}
            </Typography>
            {typeof (pnlData as { pnl?: number })?.pnl === "number" ? (
              <PnLComponent
                pnl={(pnlData as { pnl: number }).pnl}
                points={(pnlData as { points?: number }).points}
              />
            ) : null}
          </Box>
        </Box>
      ) : null}

      {Array.isArray(jobOrders) && jobOrders.length ? (
        <BrokerOrders orders={jobOrders as never[]} />
      ) : null}
    </Paper>
  )
}

const KILL_MESSAGES = {
  intraday:
    "Flatten today's straddles and strangles (abort + square-off). Chase Nifty futures stay running.",
  all: "Flatten today's option jobs AND pause Chase, then square off Chase futures. Use this only if the hedge should come off too.",
} as const

const KillDeskButtons = ({ onDone }: { onDone: () => Promise<void> }) => {
  const [pendingScope, setPendingScope] = useState<keyof typeof KILL_MESSAGES | null>(null)
  const [loading, setLoading] = useState(false)
  const { showMessage, SnackbarAlert } = useSnackbar()

  const runKill = async () => {
    if (!pendingScope) return
    setLoading(true)
    try {
      await fetchJson("/api/kill-desk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: pendingScope }),
      })
      setPendingScope(null)
      await onDone()
    } catch (e) {
      const err = e as FetchJsonError
      showMessage(
        (err.data as { error?: string })?.error || err.message || "Could not run kill",
        "error"
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {SnackbarAlert}
      <ConfirmDialog
        open={Boolean(pendingScope)}
        title={pendingScope === "all" ? "Kill all jobs?" : "Kill intraday jobs?"}
        message={pendingScope ? KILL_MESSAGES[pendingScope] : ""}
        confirmColor={pendingScope === "all" ? "error" : "warning"}
        confirmLabel="Proceed"
        onConfirm={runKill}
        onCancel={() => setPendingScope(null)}
      />
      <Box
        sx={{
          textAlign: "center",
          mt: 4,
          display: "flex",
          gap: 1,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        <Button
          color="warning"
          variant="outlined"
          loading={loading}
          onClick={() => setPendingScope("intraday")}
        >
          <Stop /> Kill intraday
        </Button>
        <Button
          color="error"
          variant="outlined"
          loading={loading}
          onClick={() => setPendingScope("all")}
        >
          <Stop /> Kill all (incl. Chase)
        </Button>
      </Box>
    </>
  )
}

const TradesForDay = () => {
  const {
    data: trades,
    error,
    mutate: reloadTrades,
  } = useSWR("/api/trades_day", {
    refreshInterval: 10000,
  })

  if (error) {
    return <Typography color="error">Could not load today&apos;s trades. Retry shortly.</Typography>
  }

  if (!trades?.length) {
    return (
      <>
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Nothing scheduled today
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Run a weekday template or open a new structure. Chase may still be running.
          </Typography>
          <Button sx={{ mr: 1 }} onClick={() => router.push("/dashboard?tabId=2")}>
            Today&apos;s plan
          </Button>
          <Button variant="contained" onClick={() => router.push("/dashboard?tabId=1")}>
            New trade
          </Button>
        </Paper>
        <KillDeskButtons onDone={() => reloadTrades()} />
      </>
    )
  }

  return (
    <>
      <Box sx={{ mb: 6 }}>
        {trades.map((trade: TradeJob) => (
          <WrapperComponent
            key={trade.id}
            {...trade}
            detailsComponent={(strategy, jobDetails) => (
              <TradeDetails
                strategy={strategy}
                tradeDetails={trade}
                jobDetails={(jobDetails ?? {}) as Record<string, unknown>}
              />
            )}
          />
        ))}
      </Box>

      <KillDeskButtons onDone={() => reloadTrades()} />
    </>
  )
}

export default TradesForDay
