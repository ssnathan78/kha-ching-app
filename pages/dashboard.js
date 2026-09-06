import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Grid,
  Paper,
  Tab,
  Tabs,
  Typography,
} from "@mui/material"
import dayjs from "dayjs"
import Link from "next/link"
import { useRouter } from "next/router"
import { useEffect, useState } from "react"
import useSWR from "swr"

import Layout from "../components/Layout"
import PlanDash from "../components/PlanDash"
import TradesForDay from "../components/TradesForDay"
import { STRATEGIES, STRATEGIES_DETAILS } from "../lib/constants"
import useUser from "../lib/useUser"

function TabPanel({ children, value, index }) {
  if (value !== index) {
    return null
  }
  return (
    <Box role="tabpanel" sx={{ pt: 3 }}>
      {children}
    </Box>
  )
}

const Dashboard = () => {
  const { user } = useUser({ redirectTo: "/" })
  const router = useRouter()
  const [value, setValue] = useState(() => (router.query?.tabId ? Number(router.query.tabId) : 0))
  const { data: trades } = useSWR(user?.isLoggedIn ? "/api/trades_day" : null)

  useEffect(() => {
    if (router.query?.tabId != null && Number(router.query.tabId) !== value) {
      setValue(Number(router.query.tabId))
    }
  }, [router.query?.tabId, value])

  if (!user || user.isLoggedIn === false) {
    return <Layout title="Dashboard" loading />
  }

  const handleChange = (_event, newValue) => {
    setValue(newValue)
    router.replace({ pathname: "/dashboard", query: { tabId: newValue } }, undefined, {
      shallow: true,
    })
  }

  const tradeCount = Array.isArray(trades) ? trades.length : 0
  const failedJobs = Array.isArray(trades)
    ? trades.filter(job => job?.status === "REJECT" || job?.status === "FAILED")
    : []

  return (
    <Layout title="Dashboard">
      <Box
        sx={{ mb: 4, display: "flex", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}
      >
        <Box>
          <Typography variant="h5" component="h1">
            {dayjs().format("dddd")}
          </Typography>
          <Typography color="text.secondary">
            {dayjs().format("DD MMMM YYYY")} · IST session
          </Typography>
        </Box>
        <Chip
          label={`${tradeCount} job${tradeCount === 1 ? "" : "s"} today`}
          color="primary"
          variant="outlined"
        />
      </Box>

      {failedJobs.length ? (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" component={Link} href="/desk?tab=alerts">
              Desk alerts
            </Button>
          }
        >
          {failedJobs.length} job{failedJobs.length === 1 ? "" : "s"} did not run. This is not a
          Kite order — open Desk → Alerts for the reason.
        </Alert>
      ) : null}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 2.5, height: "100%" }}>
            <Typography variant="caption" color="text.secondary">
              Today
            </Typography>
            <Typography variant="h6">
              {tradeCount === 0 ? "No live jobs" : `${tradeCount} scheduled`}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Positions, SL and square-off run from BullMQ workers in this process.
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 2.5, height: "100%" }}>
            <Typography variant="caption" color="text.secondary">
              New trade
            </Typography>
            <Typography variant="h6">Intraday vs Chase</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Punch straddle/strangle this session, or edit Chase lots on Trade plan.
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 2.5, height: "100%" }}>
            <Typography variant="caption" color="text.secondary">
              Broker
            </Typography>
            <Typography variant="h6">{user.user_name || user.user_id}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {user.broker || "Zerodha"} · session until morning IST
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ px: 1 }}>
        <Tabs
          value={value}
          onChange={handleChange}
          variant="fullWidth"
          aria-label="dashboard sections"
        >
          <Tab label="Today" />
          <Tab label="New trade" />
          <Tab label="Today's plan" />
        </Tabs>
      </Paper>

      <TabPanel value={value} index={0}>
        <TradesForDay />
      </TabPanel>
      <TabPanel value={value} index={1}>
        <Typography variant="overline" color="text.secondary">
          Intraday · punch now
        </Typography>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            {
              href: "/strat/straddle",
              title: STRATEGIES_DETAILS[STRATEGIES.ATM_STRADDLE].heading,
              body: "ATM call and put together. Same-session square-off.",
            },
            {
              href: "/strat/strangle",
              title: STRATEGIES_DETAILS[STRATEGIES.ATM_STRANGLE].heading,
              body: "Offset strikes around spot. Same-session square-off.",
            },
          ].map(card => (
            <Grid size={{ xs: 12, sm: 6 }} key={card.href}>
              <Card>
                <CardActionArea component={Link} href={card.href} sx={{ p: 1 }}>
                  <CardContent>
                    <Typography variant="h6" sx={{ mb: 1 }}>
                      {card.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {card.body}
                    </Typography>
                    <Button sx={{ mt: 2 }} size="small">
                      Open setup
                    </Button>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
        <Typography variant="overline" color="text.secondary">
          Continuous · one plan
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <Card>
              <CardActionArea component={Link} href="/chase" sx={{ p: 1 }}>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 1 }}>
                    {STRATEGIES_DETAILS[STRATEGIES.CHASE].heading}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Nifty futures, multi-day. One lots/engine config, with pause after the current
                    trade exits.
                  </Typography>
                  <Button sx={{ mt: 2 }} size="small">
                    Open Chase plan
                  </Button>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        </Grid>
      </TabPanel>
      <TabPanel value={value} index={2}>
        <Alert severity="info" sx={{ mb: 2 }}>
          This list is today&apos;s weekday straddle/strangle templates. Chase lives under Chase
          plan.
        </Alert>
        <PlanDash />
      </TabPanel>
    </Layout>
  )
}

export default Dashboard
export { getServerSideProps } from "../lib/ssrPage"
