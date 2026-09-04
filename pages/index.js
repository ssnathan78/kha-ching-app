import { useRouter } from "next/router"
import useUser from "../lib/useUser"
import styles from "../styles/Home.module.css"

export default function Home() {
  const router = useRouter()
  useUser({ redirectTo: "/dashboard", redirectIfFound: true })
  const loginError = typeof router.query.loginError === "string" ? router.query.loginError : null

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <img src="/logo.png" width="300" alt="Kha-Ching" />

        {loginError ? (
          <p className={styles.description} style={{ color: "#b71c1c", maxWidth: 480 }}>
            Kite login did not complete: {loginError}. Request tokens are one-time; click Continue
            with Kite again. Local Docker must use HTTP redirect
            http://127.0.0.1:3000/api/redirect_url_kite on kite.trade.
          </p>
        ) : null}

        <p className={styles.description}>
          <a href="/api/login">Continue with Kite</a>
        </p>
      </main>
    </div>
  )
}
