import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined"
import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined"
import AllInclusiveOutlinedIcon from "@mui/icons-material/AllInclusiveOutlined"
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined"
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined"
import HubOutlinedIcon from "@mui/icons-material/HubOutlined"
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined"
import MenuIcon from "@mui/icons-material/Menu"
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined"
import ShowChartOutlinedIcon from "@mui/icons-material/ShowChartOutlined"
import ViewQuiltOutlinedIcon from "@mui/icons-material/ViewQuiltOutlined"
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Toolbar,
  Typography,
  useMediaQuery,
} from "@mui/material"
import { useTheme } from "@mui/material/styles"
import Link from "next/link"
import { useRouter } from "next/router"
import type React from "react"
import { useState } from "react"
import useSWR from "swr"

import fetchJson from "../lib/fetchJson"
import useUser from "../lib/useUser"

const DRAWER_WIDTH = 260

function pathOnly(asPath: string) {
  return asPath.split("?")[0]
}

function selected(asPath: string, href: string) {
  if (href === "/chase") {
    return pathOnly(asPath) === "/chase"
  }
  if (href === "/plan") {
    return pathOnly(asPath) === "/plan"
  }
  if (href === "/help") {
    return pathOnly(asPath) === "/help" || pathOnly(asPath).startsWith("/help/")
  }
  return pathOnly(asPath) === href || pathOnly(asPath).startsWith(`${href}/`)
}

const itemSx = {
  mb: 0.25,
  borderRadius: 2,
  pl: 2,
  "&.Mui-selected": {
    backgroundColor: "rgba(45, 212, 191, 0.12)",
    color: "primary.main",
  },
}

type AppShellProps = {
  children: React.ReactNode
  title?: string
  maxWidth?: "sm" | "md" | "lg" | "xl" | false
}

export default function AppShell({ children, title, maxWidth = "lg" }: AppShellProps) {
  const { user, mutateUser } = useUser()
  const router = useRouter()
  const theme = useTheme()
  const compact = useMediaQuery(theme.breakpoints.down("md"))
  const [mobileOpen, setMobileOpen] = useState(false)
  const asPath = router.asPath
  const { data: alertSummary } = useSWR(user?.isLoggedIn ? "/api/desk/alerts?summary=1" : null)
  const alertCount = Number(alertSummary?.errorCount ?? 0)

  const close = () => setMobileOpen(false)

  const drawer = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", px: 1.5, py: 2 }}>
      <Box sx={{ px: 1.5, mb: 2 }}>
        <Typography variant="subtitle2" sx={{ color: "primary.main", letterSpacing: "0.16em" }}>
          KHA-CHING
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Algo desk
        </Typography>
      </Box>
      <List sx={{ flex: 1, py: 0 }} subheader={<li />}>
        <ListItemButton
          component={Link}
          href="/dashboard"
          selected={selected(asPath, "/dashboard")}
          onClick={close}
          sx={{ ...itemSx, pl: 1.5 }}
        >
          <ListItemIcon sx={{ minWidth: 36, color: "inherit" }}>
            <DashboardOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Dashboard" />
        </ListItemButton>
        <ListItemButton
          component={Link}
          href="/plan"
          selected={selected(asPath, "/plan")}
          onClick={close}
          sx={{ ...itemSx, pl: 1.5 }}
        >
          <ListItemIcon sx={{ minWidth: 36, color: "inherit" }}>
            <CalendarMonthOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Trade plan" secondary="Weekday templates" />
        </ListItemButton>
        <ListItemButton
          component={Link}
          href="/help"
          selected={selected(asPath, "/help")}
          onClick={close}
          sx={{ ...itemSx, pl: 1.5 }}
        >
          <ListItemIcon sx={{ minWidth: 36, color: "inherit" }}>
            <MenuBookOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Guide" secondary="What the fields mean" />
        </ListItemButton>

        <ListSubheader
          disableSticky
          sx={{ bgcolor: "transparent", color: "text.secondary", lineHeight: 2.4, mt: 1 }}
        >
          Intraday
        </ListSubheader>
        <ListItemButton
          component={Link}
          href="/strat/straddle"
          selected={selected(asPath, "/strat/straddle")}
          onClick={close}
          sx={itemSx}
        >
          <ListItemIcon sx={{ minWidth: 36, color: "inherit" }}>
            <ShowChartOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Straddle" secondary="ATM, same session" />
        </ListItemButton>
        <ListItemButton
          component={Link}
          href="/strat/strangle"
          selected={selected(asPath, "/strat/strangle")}
          onClick={close}
          sx={itemSx}
        >
          <ListItemIcon sx={{ minWidth: 36, color: "inherit" }}>
            <ViewQuiltOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Strangle" secondary="OTM wings, same session" />
        </ListItemButton>

        <ListSubheader
          disableSticky
          sx={{ bgcolor: "transparent", color: "text.secondary", lineHeight: 2.4, mt: 1 }}
        >
          Continuous
        </ListSubheader>
        <ListItemButton
          component={Link}
          href="/chase"
          selected={selected(asPath, "/chase")}
          onClick={close}
          sx={itemSx}
        >
          <ListItemIcon sx={{ minWidth: 36, color: "inherit" }}>
            <AllInclusiveOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Chase" secondary="One futures plan, pause/resume" />
        </ListItemButton>

        <ListSubheader
          disableSticky
          sx={{ bgcolor: "transparent", color: "text.secondary", lineHeight: 2.4, mt: 1 }}
        >
          Ops
        </ListSubheader>
        <ListItemButton
          component={Link}
          href={alertCount ? "/desk?tab=alerts" : "/desk"}
          selected={selected(asPath, "/desk")}
          onClick={close}
          sx={{ ...itemSx, pl: 1.5 }}
        >
          <ListItemIcon sx={{ minWidth: 36, color: "inherit" }}>
            <Badge color="error" badgeContent={alertCount} max={9}>
              <AccountBalanceWalletOutlinedIcon fontSize="small" />
            </Badge>
          </ListItemIcon>
          <ListItemText
            primary="Desk"
            secondary={
              alertCount
                ? `${alertCount} alert${alertCount === 1 ? "" : "s"}`
                : "Orders, signals, alerts"
            }
          />
        </ListItemButton>
        <ListItemButton
          component="a"
          href="/queues"
          target="_blank"
          rel="noreferrer"
          sx={{ ...itemSx, pl: 1.5 }}
        >
          <ListItemIcon sx={{ minWidth: 36, color: "inherit" }}>
            <HubOutlinedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Queues" secondary="Bull Board" />
        </ListItemButton>
      </List>
      <Divider sx={{ my: 1 }} />
      {user?.isLoggedIn ? (
        <Box sx={{ px: 0.5 }}>
          <ListItemButton component={Link} href="/profile" sx={{ borderRadius: 2 }} onClick={close}>
            <ListItemIcon sx={{ minWidth: 36 }}>
              <AccountCircleOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Profile" secondary={user.user_shortname || user.user_id} />
          </ListItemButton>
          <ListItemButton
            sx={{ borderRadius: 2 }}
            onClick={async () => {
              await mutateUser(fetchJson("/api/logout", { method: "POST" }))
              router.push("/")
            }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <LogoutOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Log out" />
          </ListItemButton>
        </Box>
      ) : (
        <ListItemButton component={Link} href="/" sx={{ borderRadius: 2 }}>
          <ListItemText primary="Log in" />
        </ListItemButton>
      )}
    </Box>
  )

  const widths = { sm: 600, md: 900, lg: 1140, xl: 1400 }

  return (
    <Box sx={{ minHeight: "100vh", display: "flex" }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          bgcolor: "rgba(8, 12, 20, 0.78)",
          backdropFilter: "blur(16px)",
          borderBottom: "1px solid",
          borderColor: "divider",
          ml: { md: `${DRAWER_WIDTH}px` },
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
        }}
      >
        <Toolbar>
          {compact ? (
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setMobileOpen(true)}
              sx={{ mr: 1 }}
            >
              <MenuIcon />
            </IconButton>
          ) : null}
          <Typography variant="h6" sx={{ flex: 1 }}>
            {title || "Kha-Ching"}
          </Typography>
          {user?.isLoggedIn ? (
            <Chip
              avatar={
                user.avatar_url ? (
                  <Avatar alt={user.user_shortname || "user"} src={user.avatar_url} />
                ) : (
                  <Avatar>{(user.user_shortname || "K").slice(0, 1)}</Avatar>
                )
              }
              label={user.user_name || user.user_id || "Signed in"}
              variant="outlined"
            />
          ) : (
            <Chip label="Signed out" variant="outlined" />
          )}
        </Toolbar>
      </AppBar>
      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          slotProps={{ root: { keepMounted: true } }}
          sx={{
            display: { xs: "block", md: "none" },
            "& .MuiDrawer-paper": { width: DRAWER_WIDTH, bgcolor: "#0c1422" },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: "none", md: "block" },
            "& .MuiDrawer-paper": {
              width: DRAWER_WIDTH,
              bgcolor: "#0c1422",
              borderRight: "1px solid",
              borderColor: "divider",
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flex: 1,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          pt: 11,
          pb: 6,
          px: { xs: 2, md: 4 },
        }}
      >
        <Box sx={{ maxWidth: maxWidth === false ? "none" : widths[maxWidth], mx: "auto" }}>
          {children}
        </Box>
      </Box>
    </Box>
  )
}
