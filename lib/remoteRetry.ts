import { ERROR_STRINGS } from "./constants"
import logger from "./logger"

/** Convert seconds to milliseconds. */
export const ms = (seconds: number) => seconds * 1000

export const delay = (milliseconds: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(() => {
      resolve()
    }, milliseconds)
  })

/** Signal that a `finiteStateChecker`/`withRemoteRetry` operation exceeded its time budget. */
export class RemoteRetryTimeoutError extends Error {}

/**
 * Run a promise with a timeout, invoking `onTimeout` (e.g. to cancel a poller) if it fires.
 */
export const finiteStateChecker = async <T>(
  pr: globalThis.Promise<T>,
  checkDurationMs: number,
  onTimeout?: () => void
): globalThis.Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout>
  const timeoutPromise = new globalThis.Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      onTimeout?.()
      reject(new RemoteRetryTimeoutError(`finiteStateChecker timed out after ${checkDurationMs}ms`))
    }, checkDurationMs)
  })

  try {
    return await globalThis.Promise.race([pr, timeoutPromise])
  } finally {
    clearTimeout(timeoutHandle!)
  }
}

/**
 * Retry a remote function until successful, with timeout and retry logic.
 */
export const withRemoteRetry = async (remoteFn: any, timeoutMs = ms(60)): Promise<any> => {
  let cancelled = false

  const attempt = async (): Promise<any> => {
    if (cancelled) {
      return
    }
    try {
      const isRemoteFnPromise = remoteFn && typeof (remoteFn as any).then === "function"
      return await (isRemoteFnPromise ? remoteFn : remoteFn())
    } catch (e) {
      if (e?.isAxiosError && e?.response?.status === 401) {
        throw new Error(ERROR_STRINGS.PAID_STRATEGY)
      }

      if (e?.error_type === "TokenException" || e?.error_type === "PermissionException") {
        const userId = e?.user_id ?? e?.data?.user_id ?? "unknown"
        logger.error(`withRemoteRetry TokenException — user_id: ${userId}`, e)
        throw e
      }

      logger.error(`withRemoteRetry attempt failed for ${remoteFn}`, e)
      if (cancelled) {
        throw e
      }
      await delay(ms(2))
      return attempt()
    }
  }

  let timeoutHandle: ReturnType<typeof setTimeout>
  const timeoutPromise = new globalThis.Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      cancelled = true
      reject(new RemoteRetryTimeoutError(`withRemoteRetry timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })

  try {
    return await globalThis.Promise.race([attempt(), timeoutPromise])
  } finally {
    clearTimeout(timeoutHandle!)
  }
}
