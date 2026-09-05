import type { KiteUser } from "../../types/misc"

export const MOCK_PROFILE = {
  user_id: "TEST001",
  user_name: "Test User",
  email: "test@example.com",
  user_shortname: "Test",
  avatar_url: "",
  broker: "ZERODHA",
}

export function createKiteConnectMock(
  overrides: {
    getProfile?: jest.Mock
    getOrders?: jest.Mock
    getOrderHistory?: jest.Mock
    getPositions?: jest.Mock
    getLTP?: jest.Mock
    placeOrder?: jest.Mock
    cancelOrder?: jest.Mock
  } = {}
) {
  return jest.fn().mockImplementation(() => ({
    getProfile: overrides.getProfile ?? jest.fn().mockResolvedValue(MOCK_PROFILE),
    getOrders: overrides.getOrders ?? jest.fn().mockResolvedValue([]),
    getOrderHistory: overrides.getOrderHistory ?? jest.fn().mockResolvedValue([]),
    getPositions: overrides.getPositions ?? jest.fn().mockResolvedValue({ net: [] }),
    getLTP: overrides.getLTP ?? jest.fn().mockResolvedValue({}),
    placeOrder: overrides.placeOrder ?? jest.fn().mockResolvedValue({ order_id: "mock-order-1" }),
    cancelOrder: overrides.cancelOrder ?? jest.fn().mockResolvedValue({ order_id: "mock-cancel" }),
  }))
}

export function mockKiteConnectModule(implementation?: ReturnType<typeof createKiteConnectMock>) {
  const KiteConnect = implementation ?? createKiteConnectMock()
  jest.mock("kiteconnect", () => ({
    KiteConnect,
  }))
  return KiteConnect
}

export function tokenExceptionError() {
  const err = new Error("TokenException")
  ;(err as Error & { error_type?: string }).error_type = "TokenException"
  return err
}

export function kiteUserWithToken(token = "valid_token"): KiteUser {
  return {
    isLoggedIn: true,
    session: {
      access_token: token,
      user_id: MOCK_PROFILE.user_id,
      user_name: MOCK_PROFILE.user_name,
      email: MOCK_PROFILE.email,
      broker: MOCK_PROFILE.broker,
    } as KiteUser["session"],
  }
}
