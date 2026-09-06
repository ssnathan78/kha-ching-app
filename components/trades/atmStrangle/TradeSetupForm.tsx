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
import {
  type EXIT_STRATEGIES,
  INSTRUMENTS,
  STRANGLE_ENTRY_STRATEGIES,
  STRATEGIES,
  STRATEGIES_DETAILS,
} from "../../../lib/constants"
import { coerceLots } from "../../../lib/planMapper"
import {
  coerceScheduleableExitStrategy,
  EXIT_STRATEGIES_ALLOWED_AT_SCHEDULE,
  SCHEDULEABLE_EXIT_STRATEGIES,
  validateLots,
  validateSelectedInstruments,
} from "../../../lib/strategyValidation"
import type { ATM_STRANGLE_CONFIG, AvailablePlansConfig } from "../../../types/plans"
import ExpiryTypeComponent from "../../lib/ExpiryTypeComponent"
import FormSection from "../../lib/FormSection"
import HedgeComponent from "../../lib/HedgeComponent"
import InstrumentPicker from "../../lib/InstrumentPicker"
import ProductTypeComponent from "../../lib/ProductTypeComponent"
import RollbackComponent from "../../lib/RollbackComponent"
import DiscreteSlider from "../../lib/Slider"
import SlManagerComponent from "../../lib/SlManagerComponent"
import VolatilityTypeComponent from "../../lib/VolatilityTypeComponent"

interface ATMStrangleTradeSetupFormProps {
  formHeading?: string
  strategy: STRATEGIES
  state: ATM_STRANGLE_CONFIG
  isRunnable?: boolean
  embedded?: boolean
  onChange: (changedProps: Partial<ATM_STRANGLE_CONFIG>) => void
  onCancel: () => void
  onSubmit: (data: AvailablePlansConfig | null) => void
  onRunNow?: () => void
  enabledInstruments?: INSTRUMENTS[]
  exitStrategies?: EXIT_STRATEGIES[]
}

const TradeSetupForm = ({
  formHeading,
  strategy = STRATEGIES.ATM_STRANGLE,
  state,
  onChange,
  onSubmit,
  onRunNow,
  onCancel,
  isRunnable = true,
  embedded = false,
  enabledInstruments: enabledInstrumentsProp,
  exitStrategies: exitStrategiesProp,
}: ATMStrangleTradeSetupFormProps) => {
  const isSchedulingDisabled = false

  const enabledInstruments = enabledInstrumentsProp ?? [INSTRUMENTS.NIFTY, INSTRUMENTS.BANKNIFTY]

  const exitStrategies = (exitStrategiesProp ?? [...SCHEDULEABLE_EXIT_STRATEGIES]).filter(s =>
    EXIT_STRATEGIES_ALLOWED_AT_SCHEDULE.has(s)
  )

  React.useEffect(() => {
    if (!EXIT_STRATEGIES_ALLOWED_AT_SCHEDULE.has(state.exitStrategy)) {
      onChange({ exitStrategy: coerceScheduleableExitStrategy(state.exitStrategy) })
    }
  }, [state.exitStrategy, onChange])

  const entryStrategies = [
    STRANGLE_ENTRY_STRATEGIES.DISTANCE_FROM_ATM,
    STRANGLE_ENTRY_STRATEGIES.PERCENT_FROM_ATM,
    STRANGLE_ENTRY_STRATEGIES.ENTRY_PRICE,
  ]

  const [lotsError, setLotsError] = React.useState<string | null>(null)
  const [instrumentError, setInstrumentError] = React.useState<string | null>(null)

  const handleFormSubmit = e => {
    e.preventDefault()
    const lotsCheck = validateLots(state.lots)
    if (!lotsCheck.ok) {
      setLotsError(lotsCheck.error)
      return
    }
    const instrumentsCheck = validateSelectedInstruments(state.instruments)
    if (!instrumentsCheck.ok) {
      setInstrumentError(instrumentsCheck.error)
      return
    }
    setLotsError(null)
    setInstrumentError(null)
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
          helpHref="/help/strangle#contract"
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
                error={instrumentError}
                onChange={next => {
                  setInstrumentError(null)
                  onChange({ instruments: next })
                }}
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
            <Grid size={12}>
              <FormControlLabel
                label="Inverted strangle"
                control={
                  <Checkbox
                    checked={state.inverted}
                    onChange={() => onChange({ inverted: !state.inverted })}
                  />
                }
              />
            </Grid>
          </Grid>
        </FormSection>

        <FormSection title="Entry" hint="How far from ATM" helpHref="/help/strangle#entry">
          <Grid container spacing={2}>
            <Grid size={12}>
              <FormControl component="fieldset">
                <FormLabel component="legend">Entry strategy</FormLabel>
                <RadioGroup
                  aria-label="entryStrategy"
                  name="entryStrategy"
                  value={state.entryStrategy}
                  onChange={e =>
                    onChange({
                      entryStrategy: e.target.value as STRANGLE_ENTRY_STRATEGIES,
                    })
                  }
                >
                  {entryStrategies.map(entryStrategy => (
                    <FormControlLabel
                      key={entryStrategy}
                      value={entryStrategy}
                      control={<Radio size="small" />}
                      label={
                        <Typography variant="body2">
                          {STRATEGIES_DETAILS[STRATEGIES.ATM_STRANGLE].ENTRY_STRATEGY_DETAILS[
                            entryStrategy
                          ]?.label ?? entryStrategy}
                        </Typography>
                      }
                    />
                  ))}
                </RadioGroup>
              </FormControl>
            </Grid>
            <Grid size={12}>
              {state.entryStrategy === STRANGLE_ENTRY_STRATEGIES.DISTANCE_FROM_ATM ? (
                <DiscreteSlider
                  label="Strikes away from ATM"
                  defaultValue={1}
                  step={1}
                  min={1}
                  max={20}
                  value={state.distanceFromAtm}
                  onChange={(e, newValue) => onChange({ distanceFromAtm: newValue })}
                />
              ) : state.entryStrategy === STRANGLE_ENTRY_STRATEGIES.PERCENT_FROM_ATM ? (
                <TextField
                  size="small"
                  fullWidth
                  name="percentStrikes"
                  value={state.percentfromAtm}
                  defaultValue={2}
                  onChange={e => onChange({ percentfromAtm: +e.target.value || undefined })}
                  label="Percent from ATM"
                />
              ) : (
                <TextField
                  size="small"
                  fullWidth
                  name="optionPrice"
                  value={state.optionPrice}
                  defaultValue={20}
                  onChange={e => onChange({ optionPrice: +e.target.value || undefined })}
                  label="Option price"
                />
              )}
            </Grid>
          </Grid>
        </FormSection>

        <FormSection title="Risk" hint="Stops and hedges" helpHref="/help/strangle#risk">
          <Grid container spacing={2}>
            <SlManagerComponent state={state} onChange={onChange} exitStrategies={exitStrategies} />
            <HedgeComponent
              volatilityType={state.volatilityType}
              isHedgeEnabled={state.isHedgeEnabled}
              hedgeDistance={state.hedgeDistance}
              onChange={onChange}
            />
          </Grid>
        </FormSection>

        <FormSection title="Timing" hint="When to run and flatten" helpHref="/help/strangle#timing">
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
