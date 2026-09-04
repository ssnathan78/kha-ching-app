import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive"
import Link from "next/link"
import { useRouter } from "next/router"
import React from "react"

import fetchJson from "../lib/fetchJson"
import useUser from "../lib/useUser"

const Header = () => {
  const { user, mutateUser } = useUser()
  const router = useRouter()
  return (
    <header style={{ marginBottom: 24 }}>
      <nav>
        <ul>
          <li>
            <Link href="/dashboard">Dashboard</Link>
          </li>
          <li>
            <Link href="/plan">Trade Plan</Link>
          </li>
          <li>
            <a href="/queues" target="_blank" rel="noreferrer">
              Queues
            </a>
          </li>
          {!user?.isLoggedIn && (
            <li>
              <Link href="/">Login</Link>
            </li>
          )}
          {user?.isLoggedIn && (
            <>
              <li>
                <Link href="/profile">
                  {user?.avatar_url && (
                    <img alt={user.user_shortname || "profile"} src={user.avatar_url} width={20} height={20} />
                  )}
                  Profile
                </Link>
              </li>
              <li>
                <a
                  href="/api/logout"
                  onClick={async e => {
                    e.preventDefault()
                    await mutateUser(fetchJson("/api/logout"))
                    router.push("/")
                  }}
                >
                  Logout
                </a>
              </li>
            </>
          )}
        </ul>
      </nav>
      <style jsx>
        {`
          ul {
            display: flex;
            list-style: none;
            margin-left: 0;
            padding-left: 0;
          }
          li {
            margin-right: 1rem;
            display: flex;
          }
          li:first-child {
            margin-left: auto;
          }
          a {
            color: #fff;
            text-decoration: none;
            display: flex;
            align-items: center;
          }
          a img {
            margin-right: 1em;
          }
          header {
            padding: 0.2rem;
            background-color: #19857b;
          }
        `}
      </style>
    </header>
  )
}

export default Header
