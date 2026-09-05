import type { KiteUser } from "../../types/misc"

/** Keep in sync with lib/sessionOptions.js — duplicated here to avoid side-effect imports in tests. */
export const SESSION_COOKIE_NAME = "khaching-kite-session"

export function createTestUser(overrides: Partial<KiteUser["session"]> = {}): KiteUser {
  return {
    isLoggedIn: true,
    session: {
      user_id: "TEST001",
      user_name: "Test User",
      email: "test@example.com",
      user_shortname: "Test",
      avatar_url: "",
      broker: "ZERODHA",
      access_token: "test_access_token",
      public_token: "test_public_token",
      refresh_token: "",
      api_key: process.env.KITE_API_KEY || "test_key",
      ...overrides,
    } as KiteUser["session"],
  }
}

export function createIronSessionMock(initialUser?: KiteUser) {
  const store: { user?: KiteUser } = {}
  if (initialUser) {
    store.user = initialUser
  }

  return {
    get user() {
      return store.user
    },
    set user(value: KiteUser | undefined) {
      store.user = value
    },
    save: jest.fn(async () => {}),
    destroy: jest.fn(async () => {
      delete store.user
    }),
  }
}
