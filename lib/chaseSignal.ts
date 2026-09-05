import dayjs from "dayjs"
import { chaseAllowsNewEntry, chaseManagesOpenPosition, chaseTolerances } from "./chaseDefaults"
import { getChaseEngineConfig, getChaseSettings } from "./chaseSettings"
import { CHASE_STATUS } from "./constants"
import { getChaseStatus, getSubscribeChaseJob, updateChaseStatus } from "./drizzleDbUtils"
import {
  cancelOrder,
  getKiteInstance,
  getPreviousTradingDay,
  placeKiteOrder,
  placeSL,
} from "./kiteUtils"
import logger from "./logger"
import { postToSlack, toIst } from "./utils"

export type ChaseInstrument = {
  tradingsymbol: string
  instrumentToken: number
  ema: number
  highestHigh: number
  lowestLow: number
  lastClose: number
  lotSize: number
}

export const getAcceptedPrevEma = async (
  prevRow: any,
  now: dayjs.Dayjs,
  accessToken: string
): Promise<number | null> => {
  if (!prevRow) {
    return null
  }

  const nowIst = toIst(now)
  const currentMinute = nowIst.startOf("minute")
  const cutoff = nowIst.set("hour", 10).set("minute", 15).set("second", 0).set("millisecond", 0)
  const prevCreatedAt = prevRow.createdAt ? toIst(prevRow.createdAt).startOf("minute") : null
  logger.info(
    `[chaseQueue] getAcceptedPrevEma currentMinute=${currentMinute.format("HH:mm")} cutoff=${cutoff.format("HH:mm")} prevCreatedAt=${prevCreatedAt ? prevCreatedAt.format("HH:mm") : "null"}`
  )

  if (!prevCreatedAt) {
    return null
  }

  if (currentMinute.isSame(cutoff)) {
    const previousTradingDay = toIst(await getPreviousTradingDay(accessToken)).startOf("day")
    const previousTradingDayTarget = previousTradingDay.set("hour", 16).set("minute", 15)
    return prevCreatedAt.isSame(previousTradingDayTarget) ? prevRow.ema : null
  }

  if (currentMinute.isAfter(cutoff)) {
    const target = currentMinute.subtract(1, "hour")
    return prevCreatedAt.isSame(target) ? prevRow.ema : null
  }

  return null
}

async function placeEntryTriggerOrder(
  instrument: ChaseInstrument,
  side: "BUY" | "SELL",
  triggerPrice: number,
  accessToken: string
): Promise<void> {
  const settings = await getChaseSettings()
  if (!chaseAllowsNewEntry(settings.paused)) {
    logger.info("[generateSignal] Chase is paused — skipping new entry order")
    return
  }
  const lots = settings.lots ?? 0
  if (lots <= 0) {
    logger.info("[generateSignal] not subscribed to chase — skipping entry trigger order")
    return
  }
  const quantity = lots * (instrument.lotSize ?? 1)

  const { entryLimitOffset } = await getChaseEngineConfig()
  const kite = getKiteInstance(accessToken)
  const ltpData = await kite.getLTP(`NFO:${instrument.tradingsymbol}`)
  const ltp: number = (ltpData as any)[`NFO:${instrument.tradingsymbol}`]?.last_price ?? 0
  const alreadyBreached = side === "BUY" ? ltp >= triggerPrice : ltp <= triggerPrice

  const { recordDecision } = await import("./trading/ledger")
  await recordDecision({
    strategy: "SUBSCRIBE_CHASE",
    tradingsymbol: instrument.tradingsymbol,
    exchange: "NFO",
    side,
    action: "ENTER",
    intent: alreadyBreached ? `MARKET ${side}` : `SL ${side} @ ${triggerPrice}`,
    reason: alreadyBreached ? "trigger already breached" : "EMA/buffer entry",
    riskResult: "PASSED",
    features: { ema: instrument.ema, lastClose: instrument.lastClose, triggerPrice, ltp },
    proposedQty: quantity,
    proposedPrice: triggerPrice,
    idempotencyKey: `chase-enter:${instrument.tradingsymbol}:${side}:${triggerPrice}:${quantity}:${alreadyBreached ? "mkt" : "sl"}`,
  })

  if (alreadyBreached) {
    logger.info(
      `[generateSignal] price already breached (ltp=${ltp} trigger=${triggerPrice}) — placing MARKET ${side} for ${instrument.tradingsymbol} qty=${quantity}`
    )
    await placeKiteOrder(accessToken, {
      tradingsymbol: instrument.tradingsymbol,
      exchange: "NFO",
      transaction_type: side,
      quantity,
      order_type: "MARKET",
      product: "NRML",
      tag: "chase",
    } as any)
  } else {
    logger.info(
      `[generateSignal] placing SL-M ${side} entry trigger order for ${instrument.tradingsymbol} at ${triggerPrice} qty=${quantity}`
    )
    await placeKiteOrder(accessToken, {
      tradingsymbol: instrument.tradingsymbol,
      exchange: "NFO",
      transaction_type: side,
      quantity,
      order_type: "SL",
      product: "NRML",
      trigger_price: triggerPrice,
      price: side === "BUY" ? triggerPrice + entryLimitOffset : triggerPrice - entryLimitOffset,
      tag: "chase",
    } as any)
  }
}

export const generateSignal = async (
  instruments: ChaseInstrument[],
  todaysDate: string,
  accessToken: string,
  nfoSymbol = "NIFTY"
): Promise<void> => {
  const chaseStatusData = await getChaseStatus(nfoSymbol)
  if (!chaseStatusData) {
    logger.error("[generateSignal] no chase status data found")
    return
  }
  logger.info(`[generateSignal] status=${JSON.stringify(chaseStatusData)} date=${todaysDate}`)

  let {
    status: currentStatus,
    tradingsymbol,
    stoploss,
    isSignalBreachingTolerance,
    createdAt,
  } = chaseStatusData

  const settings = await getChaseSettings()
  if (
    !chaseAllowsNewEntry(settings.paused) &&
    !chaseManagesOpenPosition(settings.paused, currentStatus)
  ) {
    if (
      currentStatus === CHASE_STATUS.AWAITING_LONG ||
      currentStatus === CHASE_STATUS.AWAITING_SHORT
    ) {
      const pendingSide = currentStatus === CHASE_STATUS.AWAITING_LONG ? "BUY" : "SELL"
      const pendingInstrument =
        instruments.find(i => i.tradingsymbol === tradingsymbol) ?? instruments[0]
      if (pendingInstrument && tradingsymbol) {
        await cancelOrder(tradingsymbol, pendingSide, accessToken)
      }
      await updateChaseStatus({
        instrument: nfoSymbol,
        updatedAt: new Date(),
        createdAt: new Date(),
        status: CHASE_STATUS.AWAITING_SIGNAL,
        isSignalBreachingTolerance: false,
      })
      logger.info("[generateSignal] paused — cancelled pending entry, waiting until resume")
      return
    }
    logger.info("[generateSignal] Chase is paused — not opening a new trade")
    return
  }

  if (!instruments.length) {
    logger.error("[generateSignal] no instruments found")
    return
  }

  let instrument = instruments.length === 1 ? instruments[0] : instruments[1]

  const [currentDate, timePart] = todaysDate.split(" ")
  const createdAtDate = createdAt ? dayjs(createdAt).format("YYYY-MM-DD") : ""
  const hour = parseInt(timePart.split(":")[0])

  if (
    (currentStatus === CHASE_STATUS.LONG || currentStatus === CHASE_STATUS.SHORT) &&
    hour !== 13
  ) {
    logger.info("[generateSignal] chase already long/short, skipping")
  } else if (
    (currentStatus === CHASE_STATUS.LONG || currentStatus === CHASE_STATUS.SHORT) &&
    hour === 13 &&
    createdAtDate !== currentDate
  ) {
    instrument = instruments.find(i => i.tradingsymbol === tradingsymbol) ?? instrument
    stoploss =
      currentStatus === CHASE_STATUS.LONG
        ? Math.max(instrument.ema, stoploss ?? 0)
        : Math.min(instrument.ema, stoploss ?? 0)
    logger.info(`[generateSignal] updating SL to ${stoploss} for ${instrument.tradingsymbol}`)
    await postToSlack(
      `:shield: Action $chase: Chase is currently ${currentStatus}, update the stoploss to ${stoploss} for symbol:${instrument.tradingsymbol}`
    )
    const { success, error } = await updateChaseStatus({
      instrument: nfoSymbol,
      stoploss,
      updatedAt: new Date(),
    })
    if (!success) {
      logger.error("[generateSignal] error updating chase_status:", error)
    } else {
      const exitSide = currentStatus === CHASE_STATUS.LONG ? "SELL" : "BUY"
      const subscribeChaseJob = await getSubscribeChaseJob()
      const lots = subscribeChaseJob?.lots ?? 0
      const quantity = lots * (instrument.lotSize ?? 1)
      await placeSL(instrument.tradingsymbol, exitSide, quantity, accessToken, stoploss)
    }
  } else if (currentStatus === CHASE_STATUS.AWAITING_SIGNAL && hour === 16) {
    logger.info("[generateSignal] 4:15 PM EOD run — EMA stored, skipping signal generation")
  } else if (currentStatus === CHASE_STATUS.AWAITING_SIGNAL) {
    const { bufferPercent } = await getChaseEngineConfig()
    const { longTolerance, shortTolerance } = chaseTolerances(instrument.ema, bufferPercent)
    logger.info(
      `[generateSignal] awaiting signal; longTolerance=${longTolerance} shortTolerance=${shortTolerance}`
    )

    if (instrument.lastClose > longTolerance) {
      stoploss = Math.round(Math.min(instrument.ema, instrument.lowestLow))
      await postToSlack(
        `:rocket: Action $chase: Chase is AWAITING_LONG. 🚀 Enter on crossing ${instrument.highestHigh} for symbol: ${instrument.tradingsymbol}, stoploss ${stoploss} :shield:`
      )
      const { success, error } = await updateChaseStatus({
        instrument: nfoSymbol,
        stoploss,
        updatedAt: new Date(),
        createdAt: new Date(),
        entryPoint: instrument.highestHigh,
        status: CHASE_STATUS.AWAITING_LONG,
        tradingsymbol: instrument.tradingsymbol,
        instrumentToken: instrument.instrumentToken,
        isSignalBreachingTolerance: false,
      })
      if (!success) {
        logger.error("[generateSignal] error updating chase_status:", error)
      } else {
        await placeEntryTriggerOrder(instrument, "BUY", instrument.highestHigh, accessToken)
      }
    } else if (instrument.lastClose < shortTolerance) {
      stoploss = Math.round(Math.max(instrument.ema, instrument.highestHigh))
      await postToSlack(
        `:rotating_light: Action $chase: Chase is AWAITING_SHORT. 🔻 Enter on crossing ${instrument.lowestLow} for symbol: ${instrument.tradingsymbol}, stoploss ${stoploss} :shield:`
      )
      const { success, error } = await updateChaseStatus({
        instrument: nfoSymbol,
        stoploss,
        updatedAt: new Date(),
        createdAt: new Date(),
        entryPoint: instrument.lowestLow,
        status: CHASE_STATUS.AWAITING_SHORT,
        tradingsymbol: instrument.tradingsymbol,
        instrumentToken: instrument.instrumentToken,
        isSignalBreachingTolerance: false,
      })
      if (!success) {
        logger.error("[generateSignal] error updating chase_status:", error)
      } else {
        await placeEntryTriggerOrder(instrument, "SELL", instrument.lowestLow, accessToken)
      }
    } else {
      await postToSlack(
        `:grey_question: Entry Signal Not Found. :hourglass_flowing_sand: Chase is AwaitingSignal`
      )
    }
  } else if (
    currentStatus === CHASE_STATUS.AWAITING_LONG ||
    currentStatus === CHASE_STATUS.AWAITING_SHORT
  ) {
    instrument = instruments.find(i => i.tradingsymbol === tradingsymbol) ?? instrument
    logger.info(`[generateSignal] validating signal for ${instrument.tradingsymbol}`)
    const { bufferPercent } = await getChaseEngineConfig()
    const { longTolerance, shortTolerance } = chaseTolerances(instrument.ema, bufferPercent)

    if (hour === 16) {
      logger.info("[generateSignal] EOD — resetting to AWAITING_SIGNAL")
      const { success, error } = await updateChaseStatus({
        instrument: nfoSymbol,
        updatedAt: new Date(),
        createdAt: new Date(),
        status: CHASE_STATUS.AWAITING_SIGNAL,
        isSignalBreachingTolerance: false,
      })
      if (!success) {
        logger.error("[generateSignal] error updating chase_status:", error)
      }
    } else if (
      currentStatus === CHASE_STATUS.AWAITING_LONG &&
      (instrument.lastClose < (stoploss ?? 0) || isSignalBreachingTolerance)
    ) {
      await postToSlack(
        `:x: Action $chase: Signal Invalid. :no_entry_sign: Chase is now AwaitingSignal :hourglass_flowing_sand:`
      )
      await cancelOrder(instrument.tradingsymbol, "BUY", accessToken)
      const { success, error } = await updateChaseStatus({
        instrument: nfoSymbol,
        updatedAt: new Date(),
        createdAt: new Date(),
        status: CHASE_STATUS.AWAITING_SIGNAL,
        isSignalBreachingTolerance: false,
      })
      if (success) {
        await generateSignal(instruments, todaysDate, accessToken, nfoSymbol)
      } else {
        logger.error("[generateSignal] error updating chase_status:", error)
      }
    } else if (
      currentStatus === CHASE_STATUS.AWAITING_LONG &&
      instrument.lastClose < shortTolerance
    ) {
      logger.info("[generateSignal] awaiting long but below short tolerance — marking breach")
      const { success, error } = await updateChaseStatus({
        instrument: nfoSymbol,
        updatedAt: new Date(),
        isSignalBreachingTolerance: true,
      })
      if (!success) {
        logger.error("[generateSignal] error updating chase_status:", error)
      }
    } else if (
      currentStatus === CHASE_STATUS.AWAITING_SHORT &&
      (instrument.lastClose > (stoploss ?? 0) || isSignalBreachingTolerance)
    ) {
      await postToSlack(
        `:x: Action $chase: Signal Invalid. :no_entry_sign: Chase is now AwaitingSignal :hourglass_flowing_sand:`
      )
      await cancelOrder(instrument.tradingsymbol, "SELL", accessToken)
      const { success, error } = await updateChaseStatus({
        instrument: nfoSymbol,
        updatedAt: new Date(),
        createdAt: new Date(),
        status: CHASE_STATUS.AWAITING_SIGNAL,
        isSignalBreachingTolerance: false,
      })
      if (success) {
        await generateSignal(instruments, todaysDate, accessToken, nfoSymbol)
      } else {
        logger.error("[generateSignal] error updating chase_status:", error)
      }
    } else if (
      currentStatus === CHASE_STATUS.AWAITING_SHORT &&
      instrument.lastClose > longTolerance
    ) {
      logger.info("[generateSignal] awaiting short but above long tolerance — marking breach")
      const { success, error } = await updateChaseStatus({
        instrument: nfoSymbol,
        isSignalBreachingTolerance: true,
        updatedAt: new Date(),
      })
      if (!success) {
        logger.error("[generateSignal] error updating chase_status:", error)
      }
    }
  }
}
