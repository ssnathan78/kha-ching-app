import React from "react"

import useUser from "../lib/useUser"
import Layout from "./Layout"

const StratLayout = ({ children }) => {
  const { user } = useUser({ redirectTo: "/" })

  if (!user || user.isLoggedIn === false) {
    return <Layout>loading...</Layout>
  }

  return <Layout>{children}</Layout>
}

export default StratLayout
