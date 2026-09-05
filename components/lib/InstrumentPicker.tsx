import {
  Checkbox,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  FormLabel,
  Radio,
  RadioGroup,
} from "@mui/material"
import React from "react"

import { INSTRUMENT_DETAILS, type INSTRUMENTS } from "../../lib/constants"

export default function InstrumentPicker({
  instruments,
  enabledInstruments,
  disabled,
  single,
  hint,
  onChange,
}: {
  instruments: Record<INSTRUMENTS, boolean>
  enabledInstruments: INSTRUMENTS[]
  disabled?: boolean
  single?: boolean
  hint?: string
  onChange: (instruments: Record<INSTRUMENTS, boolean>) => void
}) {
  const selected =
    (Object.keys(instruments) as INSTRUMENTS[]).find(key => instruments[key]) ||
    enabledInstruments[0]

  return (
    <FormControl component="fieldset">
      <FormLabel component="legend">Index</FormLabel>
      <FormHelperText sx={{ mx: 0, mt: 0, mb: 1 }}>
        {hint ??
          (single
            ? "The weekday template is for one index. Name above is only a label in the plan list."
            : "Tick every index you want to punch now. Each tick becomes its own order. Name above is only a label.")}
      </FormHelperText>
      {single ? (
        <RadioGroup
          row
          value={selected}
          onChange={e => {
            const next = e.target.value as INSTRUMENTS
            onChange(
              enabledInstruments.reduce(
                (accum, instrument) => ({ ...accum, [instrument]: instrument === next }),
                {} as Record<INSTRUMENTS, boolean>
              )
            )
          }}
        >
          {enabledInstruments.map(instrument => (
            <FormControlLabel
              key={instrument}
              value={instrument}
              disabled={disabled}
              control={<Radio size="small" />}
              label={INSTRUMENT_DETAILS[instrument].displayName}
            />
          ))}
        </RadioGroup>
      ) : (
        <FormGroup row>
          {enabledInstruments.map(instrument => (
            <FormControlLabel
              key={instrument}
              label={INSTRUMENT_DETAILS[instrument].displayName}
              control={
                <Checkbox
                  size="small"
                  disabled={disabled}
                  checked={Boolean(instruments[instrument])}
                  onChange={() =>
                    onChange({
                      ...instruments,
                      [instrument]: !instruments[instrument],
                    })
                  }
                />
              }
            />
          ))}
        </FormGroup>
      )}
    </FormControl>
  )
}
