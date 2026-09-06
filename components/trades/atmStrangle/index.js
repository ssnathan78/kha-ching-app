import { Alert, Link as MuiLink } from "@mui/material"
import axios from "axios"
import NextLink from "next/link"
import { useRouter } from "next/router"
import { useState } from "react"
import { apiErrorMessage } from "../../../lib/apiClientError"
import {
  commonOnChangeHandler,
  formatFormDataForApi,
  getSchedulingStateProps,
} from "../../../lib/browserUtils"
import { INSTRUMENTS, STRATEGIES, STRATEGIES_DETAILS } from "../../../lib/constants"
import { jobsForPunch } from "../../../lib/punchSchedule"

import Form from "./TradeSetupForm"

const AtmStrangle = ({
  strategy = STRATEGIES.ATM_STRANGLE,

  enabledInstruments,

  exitStrategies,
}) => {
  const router = useRouter()

  const { heading } = STRATEGIES_DETAILS[strategy]

  const getDefaultState = () => ({
    ...STRATEGIES_DETAILS[strategy].defaultFormState,
    ...getSchedulingStateProps(strategy),
    instruments: {
      ...STRATEGIES_DETAILS[strategy].defaultFormState.instruments,
      [INSTRUMENTS.NIFTY]: true,
    },
  })

  const [state, setState] = useState(getDefaultState())
  const [submitError, setSubmitError] = useState(null)

  const onSubmit = async (formattedStateForApiProps = {}, runNow = false) => {
    const ready = jobsForPunch({ instruments: state.instruments, lots: state.lots })
    if (!ready.ok) {
      setSubmitError(ready.error)
      return
    }
    const instruments = ready.instruments

    if (runNow) {
      const yes = await window.confirm("This will schedule this trade immediately. Are you sure?")
      if (!yes) {
        return
      }
    }

    function handleSyncJob(props) {
      return axios.post("/api/trades_day", formatFormDataForApi({ strategy, data: props }))
    }

    setSubmitError(null)
    try {
      await Promise.all(
        instruments.map(instrument => {
          const { instruments: _instruments, ...payload } = {
            ...state,
            ...formattedStateForApiProps,
            runNow,
          }
          return handleSyncJob({
            ...payload,
            instrument,
            strategy,
          })
        })
      )
      setState(getDefaultState())
      router.push("/dashboard?tabId=0")
    } catch (e) {
      console.error(e)
      setSubmitError(apiErrorMessage(e, "Could not schedule this trade"))
    }
  }

  const onChange = props => commonOnChangeHandler(props, state, setState)

  const handleRunNow = () => onSubmit({}, true)

  return (
    <>
      {submitError ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSubmitError(null)}>
          {submitError}{" "}
          <MuiLink component={NextLink} href="/desk?tab=alerts" color="inherit">
            View Desk → Alerts
          </MuiLink>
        </Alert>
      ) : null}
      <Form
        strategy={strategy}
        state={state}
        onChange={onChange}
        onSubmit={onSubmit}
        onRunNow={handleRunNow}
        onCancel={() => router.push("/dashboard")}
        formHeading={heading}
        enabledInstruments={enabledInstruments}
        exitStrategies={exitStrategies}
      />
    </>
  )
}

export default AtmStrangle
