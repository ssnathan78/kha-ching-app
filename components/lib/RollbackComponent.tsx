import { Checkbox, FormControl, FormControlLabel, FormGroup, Grid } from "@mui/material"
import React, { useEffect, useState } from "react"
import { ROLLBACK_KEY_MAP } from "../../lib/constants"
import type { ROLLBACK_TYPE } from "../../types/plans"

interface RollbackComponentProps {
  rollback: ROLLBACK_TYPE
  onChange: ({ rollback }: { rollback: ROLLBACK_TYPE }) => void
}

const RollbackComponent = ({ rollback, onChange }: RollbackComponentProps) => {
  const getIsSomeRollbackOptionEnabled = () => !!Object.keys(rollback).find(key => rollback[key])
  const [isSomeRollbackOptionEnabled, setIsSomeRollbackOptionEnabled] = useState(() =>
    getIsSomeRollbackOptionEnabled()
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute from rollback object identity
  useEffect(() => {
    setIsSomeRollbackOptionEnabled(getIsSomeRollbackOptionEnabled())
  }, [rollback])

  return (
    <Grid size={12}>
      <FormControl component="fieldset">
        <FormGroup>
          <FormControlLabel
            key="rollback"
            label="Rollback trades (BETA)"
            control={
              <Checkbox
                checked={isSomeRollbackOptionEnabled}
                onChange={() =>
                  onChange({
                    rollback: Object.keys(rollback).reduce(
                      (accum, key) => ({
                        ...accum,
                        [key]: !isSomeRollbackOptionEnabled,
                      }),
                      {}
                    ),
                  })
                }
              />
            }
          />
          <FormGroup style={{ marginLeft: 24 }}>
            {Object.keys(rollback).map(rollbackKey => (
              <FormControlLabel
                key={rollbackKey}
                label={ROLLBACK_KEY_MAP[rollbackKey]}
                control={
                  <Checkbox
                    name="rollback"
                    checked={rollback[rollbackKey]}
                    onChange={() => {
                      onChange({
                        rollback: {
                          ...rollback,
                          [rollbackKey]: !rollback[rollbackKey],
                        },
                      })
                    }}
                  />
                }
              />
            ))}
          </FormGroup>
        </FormGroup>
      </FormControl>
    </Grid>
  )
}

export default RollbackComponent
