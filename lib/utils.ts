import axios from "axios"
import dayjs, { type Dayjs } from "dayjs"
import isSameOrBefore from "dayjs/plugin/isSameOrBefore"
import timezone from "dayjs/plugin/timezone"
import utc from "dayjs/plugin/utc"
import type { KiteOrder } from "../types/kite"
import { now, nowDayjs } from "./clock"
import { EXIT_STRATEGIES, TRADES } from "./constants"
import { getLatestAccessToken, storeAccessToken } from "./drizzleDbUtils"
import { allSettled, type allSettledInterface } from "./es6-promise"
import logger from "./logger"
import { isNonTradingDay, isSessionOpen } from "./marketCalendar"
import {
  delay,
  finiteStateChecker,
  ms,
  RemoteRetryTimeoutError,
  withRemoteRetry,
} from "./remoteRetry"
import { COMPLETED_ORDER_RESPONSE } from "./strategies/mockData/orderResponse"

export { delay, finiteStateChecker, ms, RemoteRetryTimeoutError, withRemoteRetry }

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(isSameOrBefore)

const MOCK_ORDERS = process.env.MOCK_ORDERS ? JSON.parse(process.env.MOCK_ORDERS) : false
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL ?? ""

/**
 * Log an object as pretty JSON at info level.
 * @param object - anything to log
 */
export const logDeep = object => logger.info(JSON.stringify(object, null, 2))

/**
 * Convert a date value to IST by adding the +5:30 offset in milliseconds.
 * @param value - dayjs object, Date, or timestamp string
 */
export const toIst = (value: dayjs.Dayjs | Date | string): dayjs.Dayjs => {
  return dayjs(value).tz("Asia/Kolkata")
}

/** Seconds until next 7 AM IST. Used for session TTL. */
export const secondsTill7 = (): number => {
  const nowIst = toIst(now())
  const next7AmIst =
    nowIst.hour() >= 7 ? nowIst.add(1, "day").startOf("day").hour(7) : nowIst.startOf("day").hour(7)
  return next7AmIst.diff(nowIst, "second")
}

/** Milliseconds until 7 AM IST (next occurrence). Used for memoizer maxAge. */
export const millisecondsTill7 = (): number => secondsTill7() * 1000

/**
 * Post a simple text message to configured Slack Incoming Webhook URL.
 * Uses `axios` for HTTP requests and `logger` for structured logs.
 */
export async function postToSlack(message: string): Promise<void> {
  if (!SLACK_WEBHOOK_URL) {
    logger.warn("[postToSlack] SLACK_WEBHOOK_URL not configured")
    return
  }

  try {
    await axios.post(
      SLACK_WEBHOOK_URL,
      { text: message },
      { headers: { "Content-Type": "application/json" } }
    )
    logger.info("[postToSlack] Message posted to Slack successfully")
  } catch (error) {
    logger.error("[postToSlack] Error posting message to Slack", error)
  }
}

/**
 * Returns the scheduled last square-off time used for MIS orders.
 * Formatted string suitable for dayjs parsing.
 */
export const getMisOrderLastSquareOffTime = () =>
  nowDayjs().set("hour", 15).set("minutes", 24).set("seconds", 0).format()

/**
 * Calculate percentage change between two prices.
 * @param price1
 * @param price2
 * @param mode - calculation mode
 */
export function getPercentageChange(price1: number, price2: number, mode = "AGGRESIVE"): number {
  const denominator = mode === "AGGRESIVE" ? (price1 + price2) / 2 : Math.min(price1, price2)
  return Math.floor((Math.abs(price1 - price2) / denominator) * 100)
}

/**
 * Fetch completed order details from Kite order history by order id.
 * @returns the completed order or undefined
 */
export async function getCompletedOrderFromOrderHistoryById(kite, orderId) {
  const orders = await kite.getOrderHistory(orderId)
  return orders.find(odr => odr.status === "COMPLETE")
}

/**
 * Given a Kite orders response, return all completed orders or null if any incomplete.
 */
export async function getAllOrNoneCompletedOrdersByKiteResponse(kite, rawKiteOrdersResponse) {
  if (MOCK_ORDERS) {
    return [...new Array(rawKiteOrdersResponse.length)].fill(COMPLETED_ORDER_RESPONSE)
  }

  try {
    const completedOrders = (
      await Promise.all(
        rawKiteOrdersResponse.map(
          (
            { order_id } // eslint-disable-line
          ) => getCompletedOrderFromOrderHistoryById(kite, order_id)
        )
      )
    ).filter(o => o)

    if (completedOrders.length !== rawKiteOrdersResponse.length) {
      return null
    }

    return completedOrders
  } catch (e) {
    logger.error("getAllOrNoneCompletedOrdersByKiteResponse error", {
      e,
      rawKiteOrdersResponse,
    })
    return null
  }
}

/**
 * Return milliseconds left until market closing (or a hardcoded value for localhost).
 */
export const getTimeLeftInMarketClosingMs = () =>
  process.env.NEXT_PUBLIC_APP_URL?.includes("localhost:")
    ? ms(1 * 60 * 60) // if developing, hardcode one hour to market closing
    : dayjs(getMisOrderLastSquareOffTime()).diff(nowDayjs())

//Returns a boolean to check if current time is after square off time
/**
 * Check whether the current time is after the provided auto square-off time.
 * @param squareOffTime - ISO or parseable time string
 */
export const isTimeAfterAutoSquareOff = (squareOffTime: string) => {
  const finalOrderTime = getMisOrderLastSquareOffTime()
  const runAtTime = isMockOrder()
    ? squareOffTime
    : dayjs(squareOffTime).isAfter(dayjs(finalOrderTime))
      ? finalOrderTime
      : squareOffTime

  return nowDayjs().isAfter(runAtTime)
}

/**
 * Returns number of entry attempts to try based on strategy and time left in market.
 */
export const getEntryAttemptsCount = (_args: unknown) => {
  return null
}

/**
 * Map strategy to a backoff strategy name used by queues.
 */
export const getBackoffStrategy = (_args: unknown) => {
  return "fixed"
}

/**
 * Produce a custom backoff strategy function to be used with job retries.
 */
export const getCustomBackoffStrategies = () => {
  return (attemptsMade, type = "fixed", err, job) => {
    switch (type) {
      case "backOffToNearest5thMinute":
        return dayjs(getNextNthMinute(5 * 60 * 1000)).diff(nowDayjs())
      case "backOffToNearestMinute":
        return dayjs(getNextNthMinute(1 * 60 * 1000)).diff(nowDayjs())
      default: {
        const delay = job?.opts?.backoff?.delay
        return typeof delay === "number" ? delay : 0
      }
    }
  }
}

/**
 * Return queue retry/backoff options for a given exit strategy.
 * @param exitStrategy - enum from EXIT_STRATEGIES
 */
export const getQueueOptionsForExitStrategy = exitStrategy => {
  if (!exitStrategy) {
    throw new Error("getQueueOptionsForExitStrategy called without exitStrategy")
  }

  switch (exitStrategy) {
    case EXIT_STRATEGIES.MULTI_LEG_PREMIUM_THRESHOLD: {
      const recheckInterval = ms(3)
      return {
        attempts: Math.ceil(getTimeLeftInMarketClosingMs() / recheckInterval),
        backoff: {
          type: "fixed",
          delay: recheckInterval,
        },
      }
    }
    case EXIT_STRATEGIES.MIN_XPERCENT_OR_SUPERTREND: {
      const recheckInterval = ms(5 * 60)
      return {
        attempts: Math.ceil(getTimeLeftInMarketClosingMs() / recheckInterval),
        backoff: {
          type: "backOffToNearest5thMinute",
        },
      }
    }
    case EXIT_STRATEGIES.OBS_TRAIL_SL: {
      const recheckInterval = ms(1 * 60)
      return {
        attempts: Math.ceil(getTimeLeftInMarketClosingMs() / recheckInterval),
        backoff: {
          type: "backOffToNearestMinute",
        },
      }
    }
    default:
      return {
        attempts: 20,
        backoff: {
          type: "fixed",
          delay: ms(3),
        },
      }
  }
}

/**
 * Check whether a date is a market holiday or weekend.
 */
export const isDateHoliday = (date: Dayjs) => isNonTradingDay(date)

/**
 * Recursively find the last open market date since `from`.
 */
export const getLastOpenDateSince = (from: Dayjs) => {
  const fromDay = from.format("dddd")
  const yesterday = from.subtract(fromDay === "Monday" ? 3 : 1, "days")
  if (isDateHoliday(yesterday)) {
    return getLastOpenDateSince(yesterday)
  }

  return yesterday
}

/**
 * Check whether the provided access token matches the latest stored token in DB.
 */
export const checkHasSameAccessToken = async (accessToken: string) => {
  try {
    const dbAccessToken = await getLatestAccessToken()
    return dbAccessToken === accessToken
  } catch (e) {
    logger.error("🔴 [checkHasSameAccessToken] error", e)
    return false
  }
}

/**
 * Store an access token remotely (DB) and log result.
 */
export const storeAccessTokenRemotely = async (accessToken: string) => {
  try {
    await storeAccessToken(accessToken)
    logger.info("✅ [storeAccessTokenRemotely] success")
  } catch (e) {
    logger.error("🔴 [storeAccessTokenRemotely] error", e)
  }
}

/**
 * Return nearest candle time (rounded down) for a given interval.
 */
export const getNearestCandleTime = (intervalMs, referenceDate = now()) => {
  const nearestCandle = new Date(Math.floor(referenceDate.getTime() / intervalMs) * intervalMs)
  // https://kite.trade/forum/discussion/7798/historical-data-candles-inaccurate-for-small-periods
  return dayjs(nearestCandle).subtract(1, "second")
}

/**
 * Return the next timestamp rounded up to the nearest `intervalMs` boundary.
 */
export const getNextNthMinute = intervalMs => {
  // ref: https://stackoverflow.com/a/10789415/721084
  const date = now()
  const rounded = new Date(Math.ceil(date.getTime() / intervalMs) * intervalMs)
  return rounded
}

/**
 * Check whether market is currently open (based on hard-coded session times).
 */
export const isMarketOpen = (time = nowDayjs()) => isSessionOpen(time)

/**
 * Return a random integer between min and max inclusive.
 */
export function randomIntFromInterval(min: number, max: number) {
  // min and max included
  return Math.floor(Math.random() * (max - min + 1) + min)
}

interface LTP_TYPE {
  tradingsymbol: string
  strike: number
  last_price: number
}

/**
 * Find the item in `haystack` with a key closest to `needle`.
 */
export function closest(
  needle: number,
  haystack: Array<LTP_TYPE | any>,
  haystackKey: string,
  greaterThanEqualToPrice: boolean
) {
  const filtered = haystack.filter(item => {
    if (greaterThanEqualToPrice) {
      return item[haystackKey] >= needle
    }
    return item[haystackKey] >= needle || getPercentageChange(item[haystackKey], needle) <= 10
  })
  /**
   * the above ensures that we pick up a price lower than needle price,
   * only if it's at most 10% lesser than the needle price
   */
  return filtered.reduce((prev, curr) =>
    Math.abs(curr[haystackKey] - needle) < Math.abs(prev[haystackKey] - needle) ? curr : prev
  )
}

/**
 * Remove trailing forward slash from a URL.
 */
export function withoutFwdSlash(url: string): string {
  if (url.endsWith("/")) {
    return url.slice(0, url.length - 1)
  }
  return url
}

/**
 * Return whether MOCK_ORDERS is enabled via environment.
 */
export const isMockOrder = () => MOCK_ORDERS

/**
 * Poll broker order history until a desired order state is observed or rejected.
 * Returns `{ promise, cancel }` — pass `cancel` to `finiteStateChecker`'s `onTimeout`
 * so polling actually stops once the caller gives up waiting.
 */
export const orderStateChecker = (
  kite,
  orderId,
  ensureOrderState
): { promise: globalThis.Promise<any>; cancel: () => void } => {
  let cancelled = false

  /**
   * if broker responds back with order history,
   * but is not in expected state (fn arg) and is also not in failure states (REJECTED or CANCELLED)
   * then keep retrying for it to enter either of those states
   */
  const fn = async () => {
    if (cancelled) {
      return false
    }
    try {
      const orderHistory = await withRemoteRetry(() => kite.getOrderHistory(orderId))
      const byRecencyOrderHistory = orderHistory.reverse()
      // if it reaches here, then order exists in broker system

      const expectedStateOrder = byRecencyOrderHistory.find(odr => odr.status === ensureOrderState)

      if (expectedStateOrder) {
        return expectedStateOrder
      }

      logger.error("🔴 [orderStateChecker] invalid state...", {
        orderId,
        ensureOrderState,
      })
      logDeep(orderHistory)

      const wasOrderRejectedOrCancelled = byRecencyOrderHistory.find(
        odr => odr.status === kite.STATUS_REJECTED || odr.status === kite.STATUS_CANCELLED
      )

      if (wasOrderRejectedOrCancelled) {
        logger.error("🔴 [orderStateChecker] rejected or cancelled", byRecencyOrderHistory)
        throw new Error(kite.STATUS_REJECTED)
      }

      // in every other case, retry until its status changes to either of above states
      if (cancelled) {
        return false
      }
      await delay(ms(2))
      return fn()
    } catch (e) {
      logger.error("🔴 [orderStateChecker] caught", e)
      if (
        e?.message === kite.STATUS_REJECTED ||
        (e?.status === "error" &&
          e?.error_type === "GeneralException" &&
          e?.message === "Couldn't find that `order_id`.")
      ) {
        throw new Error(kite.STATUS_REJECTED)
      }
      // for other exceptions like network layer, retry
      if (cancelled) {
        throw e
      }
      await delay(ms(2))
      return fn()
    }
  }

  const promise = new globalThis.Promise((resolve, reject) => {
    fn()
      .then(resolve)
      .catch(e => {
        logger.error("🔴 [orderStateChecker] checker error", e)
        if (e?.message === kite.STATUS_REJECTED) {
          reject(e)
        }
      })
  })

  return {
    promise,
    cancel: () => {
      cancelled = true
    },
  }
}

/**
 * Attempt multiple broker orders in parallel and return aggregated success state.
 */
export const attemptBrokerOrders = async (
  ordersPr: Array<Promise<any>>
): Promise<{
  allOk: boolean
  statefulOrders: KiteOrder[]
}> => {
  try {
    const brokerOrderResolutions = await allSettled(ordersPr)
    logDeep(brokerOrderResolutions)
    const rejectedLegs = (brokerOrderResolutions as any).filter(
      (res: allSettledInterface) => res.status === "rejected"
    )
    const successfulOrders: Array<KiteOrder | null> = (brokerOrderResolutions as any)
      .map((res: allSettledInterface) =>
        res.status === "fulfilled" && res.value.successful ? res.value.response : null
      )
      .filter(o => o)
      .reduce((flattenedOrders, ordersArr) => [...flattenedOrders, ...ordersArr], [])

    if (rejectedLegs.length > 0) {
      return {
        allOk: false,
        statefulOrders: successfulOrders as KiteOrder[],
      }
    }

    return {
      allOk: true,
      statefulOrders: successfulOrders as KiteOrder[],
    }
  } catch (e) {
    logger.error("🔴 [attemptBrokerOrders] error", e)
    return {
      allOk: false,
      statefulOrders: [],
    }
  }
}

export interface apiResponseObject {
  PutDelta: number
  CallDelta: number
  StrikePrice: number
}

/**
 * Map option deltas to strike objects from API response, optionally filtering by type.
 */
export const getStrikeByDelta = (
  delta: number,
  apiResponse: {
    atmStrike: number
    data: apiResponseObject[]
  },
  type?: "PE" | "CE"
):
  | apiResponseObject
  | {
      putStrike: apiResponseObject
      callStrike: apiResponseObject
    } => {
  const { data } = apiResponse
  const putStrike = closest(delta, data, "PutDelta", false)
  const callStrike = closest(delta, data, "CallDelta", false)
  if (type === "PE") {
    return putStrike
  }

  if (type === "CE") {
    return callStrike
  }

  return {
    putStrike,
    callStrike,
  }
}

export { round } from "./tickSize"
