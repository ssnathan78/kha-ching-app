import type { KiteUser } from "./misc"

declare module "next" {
  interface NextApiRequest {
    session: {
      get: (key: "user") => KiteUser | undefined
      set: (key: "user", value: KiteUser) => void
      save: () => Promise<void>
      destroy: () => Promise<void>
    }
  }
}
