import {
  FormControl,
  FormControlLabel,
  FormLabel,
  Grid,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from "@mui/material"
import { EXIT_STRATEGIES, EXIT_STRATEGIES_DETAILS } from "../../lib/constants"
import {
  EXIT_STRATEGIES_ALLOWED_AT_SCHEDULE,
  SCHEDULEABLE_EXIT_STRATEGIES,
} from "../../lib/strategyValidation"

const SlManagerComponent = ({ state, onChange, exitStrategies }) => {
  const visibleExits = (
    exitStrategies?.length ? exitStrategies : SCHEDULEABLE_EXIT_STRATEGIES
  ).filter((exitStrategy: EXIT_STRATEGIES) => EXIT_STRATEGIES_ALLOWED_AT_SCHEDULE.has(exitStrategy))
  const selectedExit = visibleExits.includes(state.exitStrategy)
    ? state.exitStrategy
    : visibleExits[0]

  return (
    <>
      <Grid size={12}>
        <FormControl component="fieldset">
          <FormLabel component="legend">Exit Strategy</FormLabel>
          <RadioGroup
            aria-label="exitStrategy"
            name="exitStrategy"
            value={selectedExit}
            onChange={e =>
              onChange({
                exitStrategy: e.target.value as EXIT_STRATEGIES,
                isMaxLossEnabled: false,
                isMaxProfitEnabled: false,
              })
            }
          >
            {visibleExits.map(exitStrategy => (
              <FormControlLabel
                key={exitStrategy}
                value={exitStrategy}
                control={<Radio size="small" />}
                label={
                  <Typography variant="body2">
                    {EXIT_STRATEGIES_DETAILS[exitStrategy]?.label ?? exitStrategy}
                  </Typography>
                }
              />
            ))}
          </RadioGroup>
        </FormControl>
      </Grid>
      {selectedExit === EXIT_STRATEGIES.INDIVIDUAL_LEG_SLM_1X ? (
        <Grid size={12} style={{ marginBottom: "16px" }}>
          <TextField
            fullWidth
            name="slmPercent"
            value={state.slmPercent}
            onChange={(e: any) => onChange({ slmPercent: +e.target.value || undefined })}
            label="SL %"
          />
        </Grid>
      ) : null}
    </>
  )
}

export default SlManagerComponent
