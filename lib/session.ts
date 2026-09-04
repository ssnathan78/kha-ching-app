import { getIronSession, type SessionOptions } from "iron-session"
import type { NextApiHandler, NextApiRequest, NextApiResponse } from "next"
import type { SignalXUser } from "../types/misc"
import "./queue-processor"
import "./exit-strategies"
import "./watchers"
import { secondsTill7 } from "./utils"

export const SESSION_COOKIE_NAME = "khaching/kite/session"

type SessionPayload = {
  user?: SignalXUser
}

export function getSessionOptions(): SessionOptions {
  const password = process.env.SECRET_COOKIE_PASSWORD
  if (!password || password.length < 32) {
    throw new Error("SECRET_COOKIE_PASSWORD must be set and at least 32 characters")
  }

  return {
    password,
    cookieName: SESSION_COOKIE_NAME,
    ttl: secondsTill7(),
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      httpOnly: true,
    },
  }
}

export type CompatSession = {
  get: (key: "user") => SignalXUser | undefined
  set: (key: "user", value: SignalXUser) => void
  save: () => Promise<void>
  destroy: () => Promise<void>
}

function wrapSession(
  session: Awaited<ReturnType<typeof getIronSession<SessionPayload>>>
): CompatSession {
  return {
    get: key => session[key],
    set: (key, value) => {
      session[key] = value
    },
    save: () => session.save(),
    destroy: async () => {
      session.destroy()
    },
  }
}

export default function withSession(handler: NextApiHandler) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const iron = await getIronSession<SessionPayload>(req, res, getSessionOptions())
    ;(req as NextApiRequest & { session: CompatSession }).session = wrapSession(iron)
    return handler(req, res)
  }
}
