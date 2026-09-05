import withSession from "../../lib/session"

export default withSession(async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  await req.session.destroy()
  res.json({ isLoggedIn: false })
})
