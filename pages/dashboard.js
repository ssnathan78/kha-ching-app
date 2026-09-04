import { Box, Link, List, ListItem } from "@mui/material"
import AppBar from "@mui/material/AppBar"
import Tab from "@mui/material/Tab"
import Tabs from "@mui/material/Tabs"
import Typography from "@mui/material/Typography"
import dayjs from "dayjs"
import { useRouter } from "next/router"
import { useEffect, useState } from "react"

import Layout from "../components/Layout"
import PlanDash from "../components/PlanDash"
import TradesForDay from "../components/TradesForDay"
import { STRATEGIES, STRATEGIES_DETAILS } from "../lib/constants"
import useUser from "../lib/useUser"

function TabPanel(props) {
  const { children, value, index, ...other } = props

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`full-width-tabpanel-${index}`}
      aria-labelledby={`full-width-tab-${index}`}
      style={{ minHeight: 300 }}
      {...other}
    >
      {value === index && (
        <Box p={3}>
          <Box component="div">{children}</Box>
        </Box>
      )}
    </div>
  )
}

function a11yProps(index) {
  return {
    id: `full-width-tab-${index}`,
    "aria-controls": `full-width-tabpanel-${index}`,
  }
}

const Dashboard = () => {
  const { user } = useUser({ redirectTo: "/" })
  const router = useRouter()
  const [value, setValue] = useState(() => (router.query?.tabId ? Number(router.query.tabId) : 1))

  useEffect(() => {
    if (router.query?.tabId && router.query?.tabId !== value) {
      setValue(Number(router.query.tabId))
    }
  }, [router.query])

  if (!user || user.isLoggedIn === false) {
    return <Layout>loading...</Layout>
  }

  const handleChange = (event, newValue) => {
    setValue(newValue)
  }

  return (
    <Layout>
      <Typography component="h1" variant="h6" style={{ marginBottom: 24, textAlign: "center" }}>
        {dayjs().format("dddd")} / {dayjs().format("DD MMM YYYY")}
      </Typography>

      <AppBar position="static" color="inherit">
        <Tabs
          value={value}
          onChange={handleChange}
          indicatorColor="primary"
          textColor="primary"
          variant="fullWidth"
          aria-label="dashboard options"
        >
          <Tab label="Today" {...a11yProps(0)} />
          <Tab label="New Trade" {...a11yProps(1)} />
          <Tab label="Plan" {...a11yProps(2)} />
        </Tabs>
      </AppBar>
      <Box>
        <TabPanel value={value} index={0}>
          <TradesForDay />
        </TabPanel>
        <TabPanel value={value} index={1}>
          <List>
            <ListItem>
              <Link href="/strat/straddle">
                {STRATEGIES_DETAILS[STRATEGIES.ATM_STRADDLE].heading}
              </Link>
            </ListItem>
            <ListItem>
              <Link href="/strat/strangle">
                {STRATEGIES_DETAILS[STRATEGIES.ATM_STRANGLE].heading}
              </Link>
            </ListItem>
          </List>
        </TabPanel>
        <TabPanel value={value} index={2}>
          <PlanDash />
        </TabPanel>
      </Box>
    </Layout>
  )
}

export default Dashboard
