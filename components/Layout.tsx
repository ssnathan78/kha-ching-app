import { Box, CircularProgress } from "@mui/material"
import type React from "react"

import AppShell from "./AppShell"

type LayoutProps = {
  children?: React.ReactNode
  title?: string
  maxWidth?: "sm" | "md" | "lg" | "xl" | false
  loading?: boolean
}

const Layout = ({ children, title, maxWidth = "lg", loading = false }: LayoutProps) => {
  if (loading) {
    return (
      <AppShell title={title} maxWidth={maxWidth}>
        <Box sx={{ display: "flex", justifyContent: "center", py: 10 }}>
          <CircularProgress size={28} />
        </Box>
      </AppShell>
    )
  }

  return (
    <AppShell title={title} maxWidth={maxWidth}>
      {children}
    </AppShell>
  )
}

export default Layout
