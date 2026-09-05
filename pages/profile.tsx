import { Box, Chip, Divider, Paper, Stack, Typography } from "@mui/material"
import React from "react"
import Layout from "../components/Layout"
import useUser from "../lib/useUser"

const Profile = () => {
  const { user } = useUser({ redirectTo: "/" })

  if (!user?.isLoggedIn) {
    return <Layout title="Profile" loading />
  }

  const rows = [
    ["User ID", user.user_id],
    ["Name", user.user_name],
    ["Email", user.email],
    ["Broker", user.broker],
  ]

  return (
    <Layout title="Profile" maxWidth="sm">
      <Typography variant="h5" sx={{ mb: 1 }}>
        Broker session
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Access tokens stay on the server cookie. This page only shows public profile fields.
      </Typography>
      <Paper sx={{ p: 3 }}>
        <Stack spacing={2}>
          {rows.map(([label, value], idx) => (
            <Box key={label}>
              {idx > 0 ? <Divider sx={{ mb: 2 }} /> : null}
              <Typography variant="caption" color="text.secondary">
                {label}
              </Typography>
              <Typography variant="body1">{value || "—"}</Typography>
            </Box>
          ))}
        </Stack>
        <Chip sx={{ mt: 3 }} color="success" variant="outlined" label="Logged in" />
      </Paper>
    </Layout>
  )
}

export default Profile
export { getServerSideProps } from "../lib/ssrPage"
