import { getIronSession } from "iron-session"
import type { NextApiHandler, NextApiRequest, NextApiResponse } from "next"
import { createMocks } from "node-mocks-http"

import type { KiteUser } from "../../types/misc"
import { createIronSessionMock } from "./sessionFactory"

export type ApiInvokeResult = {
  status: number
  body: unknown
  headers: Record<string, string | string[] | undefined>
  text: string
  ended: boolean
}

export type ApiInvokeOptions = {
  method?: string
  body?: unknown
  query?: Record<string, string | string[]>
  headers?: Record<string, string>
  /** Omit for anonymous; pass null to force no user after iron-session mock. */
  user?: KiteUser | null
}

/**
 * Configure iron-session mock before importing handlers that use withSession.
 * Call in beforeEach or at top of test file after jest.mock('iron-session').
 */
export function mockSessionForUser(user?: KiteUser | null) {
  const iron = createIronSessionMock(user ?? undefined)
  ;(getIronSession as jest.Mock).mockResolvedValue(iron)
  return iron
}

/** Invoke a Next.js API handler (with or without withSession). */
export async function invokeApi(
  handler: NextApiHandler,
  options: ApiInvokeOptions = {}
): Promise<ApiInvokeResult> {
  if (options.user !== undefined) {
    mockSessionForUser(options.user)
  }

  const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
    method: options.method ?? "GET",
    body: options.body,
    query: options.query ?? {},
    headers: {
      "content-type": "application/json",
      ...options.headers,
    },
  })

  await handler(req, res)

  const status = res._getStatusCode()
  const text = res._getData()
  let body: unknown = text

  if (text && typeof text === "string") {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }

  return {
    status,
    body,
    headers: res._getHeaders(),
    text: typeof text === "string" ? text : String(text),
    ended: res._isEndCalled(),
  }
}

/** Assert helpers */
export function expectStatus(result: ApiInvokeResult, code: number) {
  expect(result.status).toBe(code)
}

export function expectJsonBody<T extends Record<string, unknown>>(result: ApiInvokeResult) {
  expect(typeof result.body).toBe("object")
  return result.body as T
}
