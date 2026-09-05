import {
  FormControl,
  FormControlLabel,
  FormLabel,
  Grid,
  Radio,
  RadioGroup,
  Typography,
} from "@mui/material"
import React, { useEffect } from "react"
import {
  EXPIRY_TYPE,
  EXPIRY_TYPE_HUMAN,
  expiryTypesForInstrument,
  type INSTRUMENTS,
} from "../../lib/constants"

const ExpiryTypeComponent = ({ state, onChange }) => {
  const instrument = state.instrument as INSTRUMENTS | undefined
  const expiryTypes = expiryTypesForInstrument(instrument)

  useEffect(() => {
    if (state.expiryType && !expiryTypes.includes(state.expiryType)) {
      onChange({ expiryType: EXPIRY_TYPE.CURRENT })
    }
  }, [instrument, state.expiryType])

  return (
    <Grid size={12}>
      <FormControl component="fieldset">
        <FormLabel component="legend">Option expiry</FormLabel>
        <RadioGroup
          aria-label="expiryTypes"
          name="expiryType"
          value={expiryTypes.includes(state.expiryType) ? state.expiryType : EXPIRY_TYPE.CURRENT}
          onChange={e => onChange({ expiryType: e.target.value as EXPIRY_TYPE })}
          row
        >
          {expiryTypes.map(expiryType => (
            <FormControlLabel
              key={expiryType}
              value={expiryType}
              control={<Radio size="small" />}
              label={<Typography variant="body2">{EXPIRY_TYPE_HUMAN[expiryType]}</Typography>}
            />
          ))}
        </RadioGroup>
        {instrument && !expiryTypes.includes(EXPIRY_TYPE.MONTHLY) ? (
          <Typography variant="caption" color="text.secondary">
            Weekly contracts are not listed for this index (monthly expiries only).
          </Typography>
        ) : null}
      </FormControl>
    </Grid>
  )
}

export default ExpiryTypeComponent
