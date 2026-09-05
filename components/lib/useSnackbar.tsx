import { Alert, Snackbar } from "@mui/material"
import React, { useCallback, useState } from "react"

export function useSnackbar() {
  const [message, setMessage] = useState<string | null>(null)
  const [severity, setSeverity] = useState<"success" | "error" | "info">("info")

  const showMessage = useCallback((text: string, level: "success" | "error" | "info" = "info") => {
    setSeverity(level)
    setMessage(text)
  }, [])

  const SnackbarAlert = (
    <Snackbar
      open={Boolean(message)}
      autoHideDuration={5000}
      onClose={() => setMessage(null)}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert severity={severity} onClose={() => setMessage(null)} sx={{ width: "100%" }}>
        {message}
      </Alert>
    </Snackbar>
  )

  return { showMessage, SnackbarAlert }
}
