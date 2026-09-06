import { Button, FormControl, InputLabel, MenuItem, Select, Stack } from "@mui/material"
import type { ReactNode } from "react"

import type { FeedPeriod } from "../../lib/trading/feedWindow"

export default function FeedToolbar({
  period,
  onPeriod,
  onClear,
  extra,
}: {
  period: FeedPeriod
  onPeriod: (period: FeedPeriod) => void
  onClear: (period: FeedPeriod) => void
  extra?: ReactNode
}) {
  return (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={1}
      sx={{ px: 2, pt: 1.5, mb: 1.5, flexWrap: "wrap", alignItems: { md: "center" } }}
    >
      <FormControl size="small" sx={{ minWidth: 140 }}>
        <InputLabel>When</InputLabel>
        <Select label="When" value={period} onChange={e => onPeriod(e.target.value as FeedPeriod)}>
          <MenuItem value="all">All</MenuItem>
          <MenuItem value="today">Today (IST)</MenuItem>
          <MenuItem value="before_today">Before today</MenuItem>
        </Select>
      </FormControl>
      {extra}
      <Button size="small" variant="outlined" onClick={() => onClear("today")}>
        Clear today
      </Button>
      <Button size="small" variant="outlined" onClick={() => onClear("before_today")}>
        Clear before today
      </Button>
      <Button size="small" color="warning" variant="outlined" onClick={() => onClear("all")}>
        Clear all
      </Button>
    </Stack>
  )
}
