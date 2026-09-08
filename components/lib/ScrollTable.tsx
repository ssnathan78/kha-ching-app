import { Box, TableContainer } from "@mui/material"
import type { ReactNode } from "react"

type ScrollTableProps = {
  children: ReactNode
  minWidth?: number
}

export default function ScrollTable({ children, minWidth = 640 }: ScrollTableProps) {
  return (
    <TableContainer
      sx={{
        overflowX: "auto",
        maxWidth: "100%",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <Box sx={{ minWidth }}>{children}</Box>
    </TableContainer>
  )
}
