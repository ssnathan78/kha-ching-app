import withSession from "../../lib/session"

/** Log out of the app session only. Does not flatten trades or pause Chase. */
export default withSession(async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  await req.session.destroy()
  res.json({ status: "ok", isLoggedIn: false })
})
