export class FetchJsonError extends Error {
  response: Response
  data: unknown

  constructor(message: string, response: Response, data: unknown) {
    super(message)
    this.name = "FetchJsonError"
    this.response = response
    this.data = data
  }
}

export default async function fetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, init)
  let data: unknown

  try {
    data = await response.json()
  } catch {
    data = { message: response.statusText }
  }

  if (response.ok) {
    return data as T
  }

  const fromBody =
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof (data as { error: unknown }).error === "string"
      ? (data as { error: string }).error
      : null
  throw new FetchJsonError(fromBody || response.statusText, response, data)
}
