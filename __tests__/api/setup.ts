/** Shared setup for API contract tests — mock iron-session before handlers load. */
jest.mock("iron-session", () => ({
  getIronSession: jest.fn(),
}))
