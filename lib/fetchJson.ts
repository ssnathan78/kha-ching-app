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

  throw new FetchJsonError(response.statusText, response, data)
}
