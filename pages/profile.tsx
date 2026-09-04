import Layout from "../components/Layout"
import useUser from "../lib/useUser"
import React from "react"

const Profile = () => {
  const { user } = useUser({ redirectTo: "/" })

  if (!user?.isLoggedIn) {
    return <Layout>loading...</Layout>
  }

  return (
    <Layout>
      <h1>Zerodha profile</h1>
      <dl>
        <dt>User ID</dt>
        <dd>{user.user_id}</dd>
        <dt>Name</dt>
        <dd>{user.user_name}</dd>
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Broker</dt>
        <dd>{user.broker}</dd>
      </dl>
    </Layout>
  )
}

export default Profile
