import React from "react"

import "../styles/globals.css"

import CssBaseline from "@mui/material/CssBaseline"

import { ThemeProvider } from "@mui/material/styles"
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs"
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider"

import Head from "next/head"

import { SWRConfig } from "swr"

import fetch from "../lib/fetchJson"

import theme from "../src/theme"

function MyApp({ Component, pageProps }) {
  return (
    <SWRConfig
      value={{
        fetcher: fetch,

        onError: err => {
          console.error(err)
        },
      }}
    >
      <Head>
        <meta charSet="utf-8" />

        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />

        <meta
          name="viewport"
          content="width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=1,user-scalable=no"
        />

        <meta
          name="description"
          content="Kha-Ching is a personal algorithmic trading app for Indian stock markets"
        />

        <meta name="keywords" content="algo trading, systematic trading, automation, strategies" />

        <title>Kha-Ching</title>

        <link rel="manifest" href="/manifest.json" />

        <link href="/icons/favicon-16x16.png" rel="icon" type="image/png" sizes="16x16" />

        <link href="/icons/favicon-32x32.png" rel="icon" type="image/png" sizes="32x32" />

        <link rel="apple-touch-icon" href="/apple-icon.png" />

        <meta name="theme-color" content="#080c14" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap"
        />
      </Head>

      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <ThemeProvider theme={theme}>
          <CssBaseline />

          <Component {...pageProps} />
        </ThemeProvider>
      </LocalizationProvider>
    </SWRConfig>
  )
}

export default MyApp
