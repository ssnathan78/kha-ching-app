import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableContainer from "@mui/material/TableContainer"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import React from "react"

export default function OrdersTable({ rows = [] }) {
  const safeRows = Array.isArray(rows) ? rows.filter(Boolean) : []

  return (
    <TableContainer sx={{ overflowX: "auto", maxWidth: "100%", WebkitOverflowScrolling: "touch" }}>
      <Table size="small" sx={{ minWidth: 280 }}>
        <TableBody>
          {safeRows.map((row, idx) => {
            const cells = Array.isArray(row) ? row : [{ value: row }]
            const rowKey = String(cells[0]?.value ?? `row-${idx}`)

            return (
              <TableRow key={rowKey}>
                {cells.map((cell, rIdx) => (
                  <TableCell
                    key={`${rowKey}-${cell?.value ?? rIdx}`}
                    align={(cell && cell.align) || "left"}
                    style={idx === 0 ? { fontWeight: 900 } : null}
                  >
                    {cell && cell.value != null ? cell.value : ""}
                  </TableCell>
                ))}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
