import { Box, Link as MuiLink, Typography } from "@mui/material"
import NextLink from "next/link"
import type React from "react"

export default function FormSection({
  title,
  hint,
  helpHref,
  children,
  span = false,
}: {
  title: string
  hint?: string
  helpHref?: string
  children: React.ReactNode
  span?: boolean
}) {
  return (
    <Box
      sx={{
        gridColumn: span ? "1 / -1" : "auto",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 2,
        p: 2,
        minWidth: 0,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1, flexWrap: "wrap" }}>
        <Typography variant="overline" color="primary.main" sx={{ letterSpacing: "0.08em" }}>
          {title}
        </Typography>
        {helpHref ? (
          <MuiLink component={NextLink} href={helpHref} variant="caption">
            What is this?
          </MuiLink>
        ) : null}
      </Box>
      {hint ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
          {hint}
        </Typography>
      ) : (
        <Box sx={{ mb: 1 }} />
      )}
      {children}
    </Box>
  )
}
