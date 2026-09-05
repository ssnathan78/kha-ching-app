import { Alert, Box, Button, Paper, Stack, Typography } from "@mui/material"
import { useRouter } from "next/router"
import useUser from "../lib/useUser"

export default function Home() {
  const router = useRouter()
  useUser({ redirectTo: "/dashboard", redirectIfFound: true })
  const loginError = typeof router.query.loginError === "string" ? router.query.loginError : null

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
      }}
    >
      <Paper sx={{ maxWidth: 480, width: "100%", p: { xs: 3, sm: 5 } }}>
        <Typography variant="overline" color="primary.main" sx={{ letterSpacing: "0.18em" }}>
          Kha-Ching
        </Typography>
        <Typography variant="h4" sx={{ mt: 1, mb: 1 }}>
          Personal algo desk
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Sign in with Zerodha Kite. Local Docker uses HTTP cookies; keep mock orders on until you
          intend live punches.
        </Typography>
        {loginError ? (
          <Alert severity="error" sx={{ mb: 3 }}>
            {loginError}. Request tokens are one-time — click Continue with Kite again.
          </Alert>
        ) : null}
        <Stack spacing={1.5}>
          <Button variant="contained" size="large" href="/api/login" fullWidth>
            Continue with Kite
          </Button>
          <Typography variant="caption" color="text.secondary">
            Redirect URL on kite.trade must match this origin, including http vs https.
          </Typography>
        </Stack>
      </Paper>
    </Box>
  )
}

export { getServerSideProps } from "../lib/ssrPage"
