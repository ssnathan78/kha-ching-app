import {
  FormControl,
  FormControlLabel,
  FormLabel,
  Grid,
  Radio,
  RadioGroup,
  Typography,
} from "@mui/material"
import React from "react"
import { VOLATILITY_TYPE } from "../../lib/constants"

const VolatilityTypeComponent = ({ state, onChange }) => {
  const volTypes = [VOLATILITY_TYPE.SHORT, VOLATILITY_TYPE.LONG]
  return (
    <Grid size={12}>
      <FormControl component="fieldset">
        <FormLabel component="legend">Vol type</FormLabel>
        <RadioGroup
          aria-label="volatilityType"
          name="volatilityType"
          value={state.volatilityType}
          onChange={e => onChange({ volatilityType: e.target.value as VOLATILITY_TYPE })}
          row
        >
          {volTypes.map(volatilityType => (
            <FormControlLabel
              key={volatilityType}
              value={volatilityType}
              control={<Radio size="small" />}
              label={<Typography variant="body2">{volatilityType}</Typography>}
            />
          ))}
        </RadioGroup>
      </FormControl>
    </Grid>
  )
}

export default VolatilityTypeComponent
