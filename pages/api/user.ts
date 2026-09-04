import { KiteConnect } from "kiteconnect"

import withSession from "../../lib/session"
import type { KiteUser } from "../../types/misc"

const apiKey = process.env.KITE_API_KEY

export default withSession(async (req, res) => {
  const user: KiteUser | undefined = req.session.get("user")

  if (user) {
    if (!apiKey) {
      return res.status(500).send("KITE_API_KEY not configured")
    }
    const kc = new KiteConnect({
      api_key: apiKey,
      access_token: user?.session?.access_token,
    })

    try {
      await kc.getProfile()

      res.json({
        isLoggedIn: true,
        user_id: user.session?.user_id,
        user_name: user.session?.user_name,
        email: user.session?.email,
        user_shortname: user.session?.user_shortname,
        avatar_url: user.session?.avatar_url,
        broker: user.session?.broker,
      })
    } catch (_e) {
      await req.session.destroy()
      res.json({
        isLoggedIn: false,
      })
    }
  } else {
    res.json({
      isLoggedIn: false,
    })
  }
})
