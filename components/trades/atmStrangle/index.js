import axios from "axios"

import { useRouter } from "next/router"

import React, { useState } from "react"

import {
  commonOnChangeHandler,
  formatFormDataForApi,
  getSchedulingStateProps,
} from "../../../lib/browserUtils"

import { STRATEGIES, STRATEGIES_DETAILS } from "../../../lib/constants"

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
  })

  const [state, setState] = useState(getDefaultState())

  const onSubmit = async (formattedStateForApiProps = {}, runNow = false) => {
    if (runNow) {
      const yes = await window.confirm("This will schedule this trade immediately. Are you sure?")

      if (!yes) {
        return
      }
    }

    function handleSyncJob(props) {
      return axios.post("/api/trades_day", formatFormDataForApi({ strategy, data: props }))
    }

    try {
      await Promise.all(
        Object.keys(state.instruments)

          .filter(key => state.instruments[key])

          .map(instrument => {
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
    }
  }

  const onChange = props => commonOnChangeHandler(props, state, setState)

  const handleRunNow = () => onSubmit({}, true)

  return (
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
  )
}

export default AtmStrangle
