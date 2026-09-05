import {
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormLabel,
  Grid,
  Paper,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from "@mui/material"
import { TimePicker } from "@mui/x-date-pickers/TimePicker"
import dayjs from "dayjs"
import React from "react"

import { ensureIST, formatFormDataForApi } from "../../../lib/browserUtils"
import { EXIT_STRATEGIES, INSTRUMENTS, STRATEGIES } from "../../../lib/constants"
import { coerceLots } from "../../../lib/planMapper"
import { EXIT_STRATEGIES_ALLOWED_AT_SCHEDULE, validateLots } from "../../../lib/strategyValidation"
import type { ATM_STRADDLE_CONFIG, AvailablePlansConfig } from "../../../types/plans"
import ExpiryTypeComponent from "../../lib/ExpiryTypeComponent"
import FormSection from "../../lib/FormSection"
import HedgeComponent from "../../lib/HedgeComponent"
import InstrumentPicker from "../../lib/InstrumentPicker"
import ProductTypeComponent from "../../lib/ProductTypeComponent"
import RollbackComponent from "../../lib/RollbackComponent"
import SlManagerComponent from "../../lib/SlManagerComponent"
import VolatilityTypeComponent from "../../lib/VolatilityTypeComponent"

interface ATMStraddleTradeSetupFormProps {
  formHeading?: string
  strategy: STRATEGIES
  state: ATM_STRADDLE_CONFIG
  isRunnable?: boolean
  embedded?: boolean
  onChange: (changedProps: Partial<ATM_STRADDLE_CONFIG>) => void
  onCancel: () => void
  onSubmit: (data: AvailablePlansConfig | null) => void
  onRunNow?: () => void
  enabledInstruments?: INSTRUMENTS[]
  exitStrategies?: EXIT_STRATEGIES[]
}

const TradeSetupForm = ({
  formHeading,
  strategy = STRATEGIES.ATM_STRADDLE,
  state,
  onChange,
  onSubmit,
  onRunNow,
  onCancel,
  isRunnable = true,
  embedded = false,
  enabledInstruments: enabledInstrumentsProp,
  exitStrategies: exitStrategiesProp,
}: ATMStraddleTradeSetupFormProps) => {
  const isSchedulingDisabled = false

  const enabledInstruments =
    enabledInstrumentsProp ??
    (strategy === STRATEGIES.ATM_STRADDLE
      ? [INSTRUMENTS.NIFTY, INSTRUMENTS.BANKNIFTY, INSTRUMENTS.FINNIFTY]
      : [INSTRUMENTS.NIFTY, INSTRUMENTS.BANKNIFTY])

  const exitStrategies =
    exitStrategiesProp ??
    [EXIT_STRATEGIES.INDIVIDUAL_LEG_SLM_1X, EXIT_STRATEGIES.NO_SL].filter(s =>
      EXIT_STRATEGIES_ALLOWED_AT_SCHEDULE.has(s)
    )

  const [lotsError, setLotsError] = React.useState<string | null>(null)

  const handleFormSubmit = e => {
    e.preventDefault()
    const lotsCheck = validateLots(state.lots)
    if (!lotsCheck.ok) {
      setLotsError(lotsCheck.error)
      return
    }
    setLotsError(null)
    onSubmit(formatFormDataForApi({ strategy, data: state }))
  }

  const body = (
    <>
      {formHeading ? (
        <Typography variant="h6" sx={{ mb: 2 }}>
          {formHeading}
        </Typography>
      ) : null}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr", xl: "1fr 1fr 1fr" },
          gap: 2,
        }}
      >
        <FormSection
          title="Contract"
          hint="Name is a label. Index is the actual Nifty / BankNifty / FinNifty contract."
          helpHref="/help/straddle#contract"
        >
          <Grid container spacing={2}>
            <Grid size={12}>
              <TextField
                size="small"
                fullWidth
                name="name"
                value={state.name ?? ""}
                onChange={e => onChange({ name: e.target.value })}
                label="Template name"
                helperText="Shown in the plan list. Does not change what is traded."
              />
            </Grid>
            <Grid size={12}>
              <InstrumentPicker
                single={embedded}
                instruments={state.instruments}
                enabledInstruments={enabledInstruments}
                disabled={state.disableInstrumentChange}
                onChange={next => onChange({ instruments: next })}
              />
            </Grid>
            <VolatilityTypeComponent state={state} onChange={onChange} />
            <ProductTypeComponent state={state} onChange={onChange} />
            <ExpiryTypeComponent state={state} onChange={onChange} />
            <Grid size={12}>
              <TextField
                size="small"
                fullWidth
                name="lots"
                value={state.lots ?? ""}
                error={Boolean(lotsError)}
                helperText={lotsError || ""}
                onChange={e => {
                  setLotsError(null)
                  onChange({ lots: coerceLots(e.target.value) })
                }}
                label="Lots"
              />
            </Grid>
          </Grid>
        </FormSection>

        <FormSection title="Entry" hint="Skew wait before punching" helpHref="/help/straddle#entry">
          <Grid container spacing={2}>
            <Grid size={6}>
              <TextField
                size="small"
                fullWidth
                name="maxSkewPercent"
                value={state.maxSkewPercent}
                onChange={e => onChange({ maxSkewPercent: +e.target.value || undefined })}
                label="Ideal skew %"
              />
            </Grid>
            <Grid size={6}>
              <TextField
                size="small"
                fullWidth
                name="thresholdSkewPercent"
                value={state.thresholdSkewPercent}
                onChange={e => onChange({ thresholdSkewPercent: +e.target.value || undefined })}
                label="Threshold skew %"
              />
            </Grid>
            <Grid size={12}>
              <TextField
                size="small"
                fullWidth
                name="expireIfUnsuccessfulInMins"
                value={state.expireIfUnsuccessfulInMins}
                onChange={e =>
                  onChange({
                    expireIfUnsuccessfulInMins: +e.target.value || undefined,
                  })
                }
                label="Skew checker (minutes)"
              />
            </Grid>
            <Grid size={12}>
              <FormControl component="fieldset">
                <FormLabel component="legend">If skew never converges</FormLabel>
                <RadioGroup
                  aria-label="takeTradeIrrespectiveSkew"
                  name="takeTradeIrrespectiveSkew"
                  value={state.takeTradeIrrespectiveSkew}
                  onChange={() =>
                    onChange({
                      takeTradeIrrespectiveSkew: !state.takeTradeIrrespectiveSkew,
                    })
                  }
                >
                  <FormControlLabel
                    value={false}
                    control={<Radio size="small" />}
                    label={<Typography variant="body2">Reject the trade</Typography>}
                  />
                  <FormControlLabel
                    value
                    control={<Radio size="small" />}
                    label={<Typography variant="body2">Enter anyway</Typography>}
                  />
                </RadioGroup>
              </FormControl>
            </Grid>
          </Grid>
        </FormSection>

        <FormSection
          title="Risk"
          hint="Stops, hedges, point targets"
          helpHref="/help/straddle#risk"
        >
          <Grid container spacing={2}>
            <SlManagerComponent state={state} onChange={onChange} exitStrategies={exitStrategies} />
            <HedgeComponent
              volatilityType={state.volatilityType}
              isHedgeEnabled={state.isHedgeEnabled}
              hedgeDistance={state.hedgeDistance}
              onChange={onChange}
            />
            <Grid size={12}>
              <FormControl component="fieldset">
                <FormGroup>
                  <FormControlLabel
                    label="Square off if losses breach (points)"
                    control={
                      <Checkbox
                        checked={state.isMaxLossEnabled}
                        onChange={() =>
                          onChange({
                            isMaxLossEnabled: !state.isMaxLossEnabled,
                          })
                        }
                      />
                    }
                  />
                  {state.isMaxLossEnabled ? (
                    <TextField
                      size="small"
                      fullWidth
                      name="maxLossPoints"
                      value={state.trailingMaxLossPoints}
                      onChange={e =>
                        onChange({
                          trailingMaxLossPoints: +e.target.value || undefined,
                        })
                      }
                      label="Max loss (points)"
                    />
                  ) : null}
                </FormGroup>
              </FormControl>
            </Grid>
            <Grid size={12}>
              <FormControl component="fieldset">
                <FormGroup>
                  <FormControlLabel
                    label="Square off if profits breach (points)"
                    control={
                      <Checkbox
                        checked={state.isMaxProfitEnabled}
                        onChange={() =>
                          onChange({
                            isMaxProfitEnabled: !state.isMaxProfitEnabled,
                          })
                        }
                      />
                    }
                  />
                  {state.isMaxProfitEnabled ? (
                    <>
                      <TextField
                        size="small"
                        fullWidth
                        name="maxProfitPoints"
                        value={state.trailingMaxProfitPoints}
                        onChange={e =>
                          onChange({
                            trailingMaxProfitPoints: +e.target.value || undefined,
                          })
                        }
                        label="Max profit (points)"
                      />
                      <TextField
                        size="small"
                        fullWidth
                        name="trailingProfitPercent"
                        value={state.trailingProfitPercent}
                        onChange={e =>
                          onChange({
                            trailingProfitPercent: +e.target.value || undefined,
                          })
                        }
                        label="Profit trail-up %"
                        helperText="On breach, target is raised by this %"
                        sx={{ mt: 2 }}
                      />
                    </>
                  ) : null}
                </FormGroup>
              </FormControl>
            </Grid>
          </Grid>
        </FormSection>

        <FormSection title="Timing" hint="When to run and flatten" helpHref="/help/straddle#timing">
          <Grid container spacing={2}>
            <Grid size={12}>
              <FormControl component="fieldset">
                <FormGroup>
                  <FormControlLabel
                    label="Auto square off"
                    control={
                      <Checkbox
                        checked={state.isAutoSquareOffEnabled}
                        onChange={() =>
                          onChange({
                            isAutoSquareOffEnabled: !state.isAutoSquareOffEnabled,
                          })
                        }
                      />
                    }
                  />
                  {state.isAutoSquareOffEnabled ? (
                    <TimePicker
                      label="Square off time"
                      value={state.squareOffTime ? dayjs(state.squareOffTime) : null}
                      onChange={selectedDate => {
                        onChange({ squareOffTime: ensureIST(selectedDate) })
                      }}
                      slotProps={{
                        textField: {
                          margin: "normal",
                          id: "time-picker",
                          size: "small",
                          fullWidth: true,
                        },
                      }}
                    />
                  ) : null}
                </FormGroup>
              </FormControl>
            </Grid>
            <RollbackComponent rollback={state.rollback!} onChange={onChange} />
            <Grid size={12}>
              <TimePicker
                label="Schedule run"
                value={isSchedulingDisabled ? null : state.runAt ? dayjs(state.runAt) : null}
                disabled={isSchedulingDisabled}
                onChange={selectedDate => {
                  onChange({ runAt: ensureIST(selectedDate) })
                }}
                slotProps={{
                  textField: {
                    margin: "normal",
                    id: "time-picker",
                    size: "small",
                    fullWidth: true,
                  },
                }}
              />
            </Grid>
          </Grid>
        </FormSection>

        <FormSection title="Save" span>
          <Box
            sx={{
              display: "flex",
              gap: 1,
              flexWrap: "wrap",
              position: "sticky",
              bottom: 0,
              py: 1,
              bgcolor: "background.paper",
            }}
          >
            {isRunnable ? (
              <Button variant="outlined" type="button" onClick={onRunNow}>
                Schedule now
              </Button>
            ) : null}
            <Button
              variant="contained"
              type="button"
              onClick={handleFormSubmit}
              disabled={isSchedulingDisabled}
            >
              {isRunnable ? `Schedule for ${dayjs(state.runAt).format("hh:mma")}` : "Save template"}
            </Button>
            {!isRunnable ? (
              <Button type="button" onClick={onCancel}>
                Cancel
              </Button>
            ) : null}
          </Box>
        </FormSection>
      </Box>
    </>
  )

  if (embedded) {
    return <form noValidate>{body}</form>
  }

  return (
    <form noValidate>
      <Paper sx={{ p: 2 }}>{body}</Paper>
    </form>
  )
}
export default TradeSetupForm
