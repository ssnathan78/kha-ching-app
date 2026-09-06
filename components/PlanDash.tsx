import { Alert, Button, Grid, Link as MuiLink, Paper, Typography } from "@mui/material"
import axios from "axios"
import dayjs from "dayjs"
import NextLink from "next/link"
import { useEffect, useState } from "react"
import useSWR, { mutate } from "swr"
import { apiErrorMessage } from "../lib/apiClientError"
import { formatFormDataForApi } from "../lib/browserUtils"

import { STRATEGIES_DETAILS } from "../lib/constants"
import { futurePlansToSchedule, PAST_PLAN_SCHEDULE_ERROR } from "../lib/planDashSchedule"
import type { SUPPORTED_TRADE_CONFIG } from "../types/trade"
import ActionButtonOrLoader from "./lib/ActionButtonOrLoader"
import TradeDetails from "./lib/tradeDetails"

const PlanDash = () => {
  const [plans, setPlans] = useState({})
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const { data: tradesDay } = useSWR("/api/trades_day")
  const dayOfWeekHuman = dayjs().format("dddd")
  const dayOfWeek = dayOfWeekHuman.toUpperCase()
  // const dayOfWeek = 'monday';

  useEffect(() => {
    async function fn() {
      const { data } = await axios("/api/plan")
      const date = dayjs()
      const day = date.get("date")
      const month = date.get("month")
      const year = date.get("year")
      const dayWiseData = data.reduce((accum, config) => {
        const updatedConfig = { ...config }
        const dayKey =
          updatedConfig.day_of_week || updatedConfig.dayOfWeek || updatedConfig.collection

        if (updatedConfig.strategy === "SUBSCRIBE_CHASE") {
          return accum
        }

        if (updatedConfig.runAt) {
          updatedConfig.runAt = dayjs(updatedConfig.runAt)
            .set("date", day)
            .set("month", month)
            .set("year", year)
            .set("seconds", 0)
            .format()
        }

        if (updatedConfig.squareOffTime) {
          updatedConfig.squareOffTime = dayjs(updatedConfig.squareOffTime)
            .set("date", day)
            .set("month", month)
            .set("year", year)
            .set("seconds", 0)
            .format()
        }

        if (!dayKey) {
          return accum
        }

        if (Array.isArray(accum[dayKey])) {
          return {
            ...accum,
            [dayKey]: [...accum[dayKey], updatedConfig],
          }
        }
        return {
          ...accum,
          [dayKey]: [updatedConfig],
        }
      }, {})

      setPlans(dayWiseData)
    }

    fn()
  }, [])

  async function handleScheduleJob(plan) {
    const { id: planId, ...planWithoutId } = plan
    const runNow = dayjs().isAfter(dayjs(plan.runAt))
    const payload = formatFormDataForApi({
      strategy: plan.strategy,
      data: {
        ...planWithoutId,
        runNow,
      },
    })

    await axios.post("/api/trades_day", {
      ...payload,
      planRef: planId,
    })
  }

  const scheduleErrorBanner = scheduleError ? (
    <Alert severity="error" sx={{ mb: 2 }} onClose={() => setScheduleError(null)}>
      {scheduleError}{" "}
      <MuiLink component={NextLink} href="/desk?tab=alerts" color="inherit">
        View Desk → Alerts
      </MuiLink>
    </Alert>
  ) : null

  const getPendingTrades = () =>
    plans[dayOfWeek]
      ?.filter(
        plan => !tradesDay?.find(trade => trade.planRef === plan.id || trade.plan_ref === plan.id)
      )
      .filter(plan => STRATEGIES_DETAILS[plan.strategy])

  async function handleScheduleEverything() {
    const pendingTrades = futurePlansToSchedule(getPendingTrades())
    if (!pendingTrades.length) {
      setScheduleError(PAST_PLAN_SCHEDULE_ERROR)
      return
    }
    setScheduleError(null)
    try {
      await Promise.all(pendingTrades.map(handleScheduleJob))
      await mutate("/api/trades_day")
    } catch (e) {
      setScheduleError(apiErrorMessage(e, "Could not schedule plan trades"))
    }
  }

  const pendingTrades = getPendingTrades()

  if (!pendingTrades?.length) {
    if (plans[dayOfWeek]) {
      return (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6">All templates scheduled</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Check the Today tab for live status and P&amp;L.
          </Typography>
        </Paper>
      )
    }
    return (
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6">No plan for {dayOfWeekHuman}</Typography>
        <Typography color="text.secondary" sx={{ mt: 1, mb: 2 }}>
          Create weekday templates so this tab can schedule them in one click.
        </Typography>
        <Button variant="contained" href="/plan">
          Open trade plan
        </Button>
      </Paper>
    )
  }

  return (
    <div>
      {scheduleErrorBanner}
      {plans[dayOfWeek] && pendingTrades?.length ? (
        <ActionButtonOrLoader>
          {({ setLoading }) => (
            <Button
              sx={{ mb: 2 }}
              variant="contained"
              onClick={async () => {
                setLoading(true)
                await handleScheduleEverything()
                setLoading(false)
              }}
            >
              Schedule all trades
            </Button>
          )}
        </ActionButtonOrLoader>
      ) : null}

      {pendingTrades.map((plan: SUPPORTED_TRADE_CONFIG, idx: number) => {
        const isPlanScheduleable = dayjs().isBefore(dayjs(plan.runAt))
        return (
          <div key={plan.id}>
            <Paper sx={{ p: 2.5, mb: 2 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                {`${idx + 1}. ${plan.name}`}
              </Typography>

              <TradeDetails strategy={plan.strategy} tradeDetails={plan} />

              <Grid style={{ marginTop: 16 }}>
                <ActionButtonOrLoader>
                  {({ setLoading }) => (
                    <Button
                      variant="contained"
                      type="button"
                      onClick={async () => {
                        setLoading(true)
                        setScheduleError(null)
                        try {
                          await handleScheduleJob(plan)
                          await mutate("/api/trades_day")
                        } catch (e) {
                          setScheduleError(apiErrorMessage(e, "Could not schedule this plan"))
                        }
                        setLoading(false)
                      }}
                    >
                      {isPlanScheduleable ? "Schedule trade" : "Run now"}
                    </Button>
                  )}
                </ActionButtonOrLoader>
              </Grid>
            </Paper>
          </div>
        )
      })}
    </div>
  )
}

export default PlanDash
