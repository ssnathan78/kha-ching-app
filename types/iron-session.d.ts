import type { KiteUser } from "./misc"

declare module "iron-session" {
  interface IronSessionData {
    user?: KiteUser
  }
}

declare module "next" {
  interface NextApiRequest {
    session: import("iron-session").IronSession<{ user?: KiteUser }>
  }
}
