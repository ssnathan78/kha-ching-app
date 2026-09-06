import axios from "axios"

export function apiErrorMessage(error: unknown, fallback = "Request failed"): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data
    if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
      return data.error
    }
    return error.message || fallback
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}
