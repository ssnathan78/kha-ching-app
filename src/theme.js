import { createTheme } from "@mui/material/styles"

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#2dd4bf",
      contrastText: "#042f2e",
    },
    secondary: {
      main: "#94a3b8",
      contrastText: "#0b1220",
    },
    error: {
      main: "#fb7185",
    },
    warning: {
      main: "#fbbf24",
    },
    info: {
      main: "#38bdf8",
    },
    success: {
      main: "#34d399",
    },
    background: {
      default: "#080c14",
      paper: "#101826",
    },
    text: {
      primary: "#e8eef7",
      secondary: "#94a3b8",
    },
    divider: "rgba(148, 163, 184, 0.16)",
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: '"IBM Plex Sans", "Segoe UI", system-ui, sans-serif',
    h1: { fontWeight: 650, letterSpacing: "-0.03em" },
    h2: { fontWeight: 650, letterSpacing: "-0.03em" },
    h5: { fontWeight: 600, letterSpacing: "-0.02em" },
    h6: { fontWeight: 600, letterSpacing: "-0.02em" },
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage:
            "radial-gradient(1200px 600px at 0% -10%, rgba(45, 212, 191, 0.08), transparent 50%), radial-gradient(900px 500px at 100% 0%, rgba(56, 189, 248, 0.06), transparent 45%)",
          backgroundAttachment: "fixed",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: "1px solid rgba(148, 163, 184, 0.12)",
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          paddingInline: 16,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
          minHeight: 48,
        },
      },
    },
  },
})

export default theme
