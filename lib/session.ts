import { getIronSession } from "iron-session"
import type { NextApiHandler, NextApiRequest, NextApiResponse } from "next"
import type { KiteUser } from "../types/misc"
import "./queue-processor"
import "./exit-strategies"
import "./watchers"
import { getSessionOptions, SESSION_COOKIE_NAME } from "./sessionOptions.js"

export { getSessionOptions, SESSION_COOKIE_NAME }

type SessionPayload = {
  user?: KiteUser
}

export default function withSession(handler: NextApiHandler) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    req.session = await getIronSession<SessionPayload>(req, res, getSessionOptions())
    return handler(req, res)
  }
}
