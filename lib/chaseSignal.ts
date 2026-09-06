import dayjs from "dayjs"
import { chaseAllowsNewEntry, chaseManagesOpenPosition, chaseTolerances } from "./chaseDefaults"
import { getChaseEngineConfig, getChaseSettings } from "./chaseSettings"
import { CHASE_STATUS } from "./constants"
import { getChaseJob, getChaseStatus, updateChaseStatus } from "./drizzleDbUtils"
import {
  cancelOrder,
  getKiteInstance,
  getPreviousTradingDay,
  placeKiteOrder,
  placeSL,
} from "./kiteUtils"
import logger from "./logger"
import { postToSlack, toIst } from "./utils"

async function persistChaseSignal(input: {
  outcome: "HOLD" | "WAIT" | "ENTER" | "REJECT" | "SKIP" | "ADJUST" | "INVALID"
  kind?: "EMA_COMPARE" | "STATE" | "SL_UPDATE" | "ENTRY"
  summary: string
  instrument?: string
  tradingsymbol?: string | null
  features?: Record<string, unknown>
  key: string
}) {
  const { recordStrategySignal } = await import("./trading/signals")
  await recordStrategySignal({
    strategy: "CHASE",
    instrument: input.instrument,
    tradingsymbol: input.tradingsymbol,
    orderTag: "chase",
    kind: input.kind ?? "EMA_COMPARE",
    outcome: input.outcome,
    summary: input.summary,
    features: input.features,
    idempotencyKey: input.key,
  })
}

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
    strategy: "CHASE",
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
      await persistChaseSignal({
        outcome: "SKIP",
        kind: "STATE",
        instrument: nfoSymbol,
        tradingsymbol,
        summary: "Paused — cancelled pending entry, waiting until resume",
        features: { status: currentStatus },
        key: `chase:paused-cancel:${nfoSymbol}:${toIst(dayjs()).format("YYYY-MM-DDTHH")}`,
      })
      return
    }
    logger.info("[generateSignal] Chase is paused — not opening a new trade")
    await persistChaseSignal({
      outcome: "SKIP",
      kind: "STATE",
      instrument: nfoSymbol,
      summary: "Paused — not opening a new trade",
      features: { status: currentStatus },
      key: `chase:paused:${nfoSymbol}:${toIst(dayjs()).format("YYYY-MM-DDTHH")}`,
    })
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
    await persistChaseSignal({
      outcome: "HOLD",
      kind: "STATE",
      instrument: nfoSymbol,
      tradingsymbol: instrument.tradingsymbol,
      summary: `Already ${currentStatus} — hourly EMA stored, no new entry`,
      features: {
        status: currentStatus,
        ema: instrument.ema,
        lastClose: instrument.lastClose,
        highestHigh: instrument.highestHigh,
        lowestLow: instrument.lowestLow,
      },
      key: `chase:inpos:${nfoSymbol}:${toIst(dayjs()).format("YYYY-MM-DDTHH")}`,
    })
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
    await persistChaseSignal({
      outcome: "ADJUST",
      kind: "SL_UPDATE",
      instrument: nfoSymbol,
      tradingsymbol: instrument.tradingsymbol,
      summary: `13:00 IST trail — SL to ${stoploss}`,
      features: {
        status: currentStatus,
        ema: instrument.ema,
        lastClose: instrument.lastClose,
        stoploss,
      },
      key: `chase:sl13:${nfoSymbol}:${toIst(dayjs()).format("YYYY-MM-DD")}`,
    })
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
      const chaseJob = await getChaseJob()
      const lots = chaseJob?.lots ?? 0
      const quantity = lots * (instrument.lotSize ?? 1)
      await placeSL(instrument.tradingsymbol, exitSide, quantity, accessToken, stoploss)
    }
  } else if (currentStatus === CHASE_STATUS.AWAITING_SIGNAL && hour === 16) {
    logger.info("[generateSignal] 4:15 PM EOD run — EMA stored, skipping signal generation")
    await persistChaseSignal({
      outcome: "SKIP",
      kind: "EMA_COMPARE",
      instrument: nfoSymbol,
      tradingsymbol: instrument.tradingsymbol,
      summary: "16:15 IST — EMA stored, no new signal",
      features: { ema: instrument.ema, lastClose: instrument.lastClose, status: currentStatus },
      key: `chase:eod:${nfoSymbol}:${toIst(dayjs()).format("YYYY-MM-DD")}`,
    })
  } else if (currentStatus === CHASE_STATUS.AWAITING_SIGNAL) {
    const { bufferPercent } = await getChaseEngineConfig()
    const { longTolerance, shortTolerance } = chaseTolerances(instrument.ema, bufferPercent)
    logger.info(
      `[generateSignal] awaiting signal; longTolerance=${longTolerance} shortTolerance=${shortTolerance}`
    )

    if (instrument.lastClose > longTolerance) {
      await persistChaseSignal({
        outcome: "ENTER",
        kind: "EMA_COMPARE",
        instrument: nfoSymbol,
        tradingsymbol: instrument.tradingsymbol,
        summary: `Close ${instrument.lastClose} above long ${longTolerance} — AWAITING_LONG`,
        features: {
          ema: instrument.ema,
          lastClose: instrument.lastClose,
          longTolerance,
          shortTolerance,
          highestHigh: instrument.highestHigh,
          lowestLow: instrument.lowestLow,
          bufferPercent,
        },
        key: `chase:long:${nfoSymbol}:${instrument.tradingsymbol}:${toIst(dayjs()).format("YYYY-MM-DDTHH")}`,
      })
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
      await persistChaseSignal({
        outcome: "ENTER",
        kind: "EMA_COMPARE",
        instrument: nfoSymbol,
        tradingsymbol: instrument.tradingsymbol,
        summary: `Close ${instrument.lastClose} below short ${shortTolerance} — AWAITING_SHORT`,
        features: {
          ema: instrument.ema,
          lastClose: instrument.lastClose,
          longTolerance,
          shortTolerance,
          highestHigh: instrument.highestHigh,
          lowestLow: instrument.lowestLow,
          bufferPercent,
        },
        key: `chase:short:${nfoSymbol}:${instrument.tradingsymbol}:${toIst(dayjs()).format("YYYY-MM-DDTHH")}`,
      })
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
      await persistChaseSignal({
        outcome: "WAIT",
        kind: "EMA_COMPARE",
        instrument: nfoSymbol,
        tradingsymbol: instrument.tradingsymbol,
        summary: `Waiting for signal — close ${instrument.lastClose} inside ${shortTolerance}–${longTolerance}`,
        features: {
          ema: instrument.ema,
          lastClose: instrument.lastClose,
          highestHigh: instrument.highestHigh,
          lowestLow: instrument.lowestLow,
          longTolerance,
          shortTolerance,
          bufferPercent,
          status: currentStatus,
        },
        key: `chase:wait:${nfoSymbol}:${toIst(dayjs()).format("YYYY-MM-DDTHH")}`,
      })
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
      await persistChaseSignal({
        outcome: "SKIP",
        kind: "STATE",
        instrument: nfoSymbol,
        tradingsymbol: instrument.tradingsymbol,
        summary: "EOD — reset pending entry to AWAITING_SIGNAL",
        features: { status: currentStatus },
        key: `chase:reset-eod:${nfoSymbol}:${toIst(dayjs()).format("YYYY-MM-DD")}`,
      })
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
      await persistChaseSignal({
        outcome: "INVALID",
        kind: "STATE",
        instrument: nfoSymbol,
        tradingsymbol: instrument.tradingsymbol,
        summary: "AWAITING_LONG invalidated — back to AWAITING_SIGNAL",
        features: {
          lastClose: instrument.lastClose,
          stoploss,
          shortTolerance,
          isSignalBreachingTolerance,
        },
        key: `chase:invalid-long:${nfoSymbol}:${toIst(dayjs()).format("YYYY-MM-DDTHH")}`,
      })
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
      await persistChaseSignal({
        outcome: "INVALID",
        kind: "STATE",
        instrument: nfoSymbol,
        tradingsymbol: instrument.tradingsymbol,
        summary: `AWAITING_LONG — close ${instrument.lastClose} crossed short ${shortTolerance}`,
        features: { lastClose: instrument.lastClose, shortTolerance },
        key: `chase:breach-long:${nfoSymbol}:${toIst(dayjs()).format("YYYY-MM-DDTHH")}`,
      })
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
      await persistChaseSignal({
        outcome: "INVALID",
        kind: "STATE",
        instrument: nfoSymbol,
        tradingsymbol: instrument.tradingsymbol,
        summary: "AWAITING_SHORT invalidated — back to AWAITING_SIGNAL",
        features: {
          lastClose: instrument.lastClose,
          stoploss,
          longTolerance,
          isSignalBreachingTolerance,
        },
        key: `chase:invalid-short:${nfoSymbol}:${toIst(dayjs()).format("YYYY-MM-DDTHH")}`,
      })
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
      await persistChaseSignal({
        outcome: "INVALID",
        kind: "STATE",
        instrument: nfoSymbol,
        tradingsymbol: instrument.tradingsymbol,
        summary: `AWAITING_SHORT — close ${instrument.lastClose} crossed long ${longTolerance}`,
        features: { lastClose: instrument.lastClose, longTolerance },
        key: `chase:breach-short:${nfoSymbol}:${toIst(dayjs()).format("YYYY-MM-DDTHH")}`,
      })
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
