import { type Job, Worker } from "bullmq"
import dayjs from "dayjs"
import type { HistoricalData, Order } from "kiteconnect"
import { CHASE_OPEN_CLASSIFY } from "../chaseDefaults"
import {
  type ChaseEntryFillResult,
  chaseFillAllowsStatusFlip,
  chaseFillFromDecision,
  chaseFlattenQty,
  chaseHasWorkingEntryOrder,
  chaseLotsFromConfig,
  chaseSideHasPosition,
  decideChaseInPositionSync,
} from "../chaseFill"
import { normalizeChaseOpenClassify, resolveChaseMorningSnapshot } from "../chaseOpenClassify"
import { getChaseSettings } from "../chaseSettings"
import {
  decideChaseEntryAction,
  generateSignal,
  resolveChaseBookBreakdown,
  resolveChasePrevEma,
} from "../chaseSignal"
import { nowDayjs } from "../clock"
import { CHASE_STATUS, STATUS_TRIGGER_PENDING } from "../constants"
import {
  getChaseStatus,
  getEmaByDate,
  getLatestEma,
  insertChaseLog,
  insertEma,
  updateChaseStatus,
} from "../drizzleDbUtils"
import {
  calculate40EMA,
  calculateEma,
  getFnOExpiries,
  getKiteInstance,
  getPreviousTradingDay,
  placeKiteOrder,
  placeSL,
} from "../kiteUtils"
import logger from "../logger"
import { CHASE_Q_NAME, redisConnection } from "../queue"
import { getOpenOrders } from "../trading/ledger"
import { matchPaperWorkingStops } from "../trading/paperExecution"
import { recordStrategySignal } from "../trading/signals"
import { ms, postToSlack, toIst, withRemoteRetry } from "../utils"

const OPEN_MINUTES = 9 * 60 + 16 // 9:16 AM IST
const CLOSE_MINUTES = 15 * 60 + 29 // 3:29 PM IST
const ROLLOVER_MINUTES = 15 * 60 // 3:00 PM IST

async function fetchChaseOpenSessionBars(
  kite: ReturnType<typeof getKiteInstance>,
  instrumentToken: number,
  nowIst: dayjs.Dayjs
): Promise<{ bars: HistoricalData[]; interval: "2minute" | "minute" }> {
  const from = nowIst
    .startOf("day")
    .set("hour", 9)
    .set("minute", 15)
    .set("second", 0)
    .set("millisecond", 0)
    .toDate()
  const to = nowIst.toDate()
  // KiteConnect typings omit 2-minute; the historical API accepts it (Chase PDF / chase_supabase).
  const twoMin = (await withRemoteRetry(
    async () =>
      kite.getHistoricalData(instrumentToken, "2minute" as "minute", from, to),
    ms(40)
  )) as HistoricalData[]
  if (Array.isArray(twoMin) && twoMin.length) {
    return { bars: twoMin, interval: "2minute" }
  }
  const oneMin = (await withRemoteRetry(
    async () => kite.getHistoricalData(instrumentToken, "minute", from, to),
    ms(40)
  )) as HistoricalData[]
  if (Array.isArray(oneMin) && oneMin.length) {
    return { bars: oneMin, interval: "minute" }
  }
  return { bars: [], interval: "2minute" }
}

async function ensureChaseEntryFilled(args: {
  side: "LONG" | "SHORT"
  tradingsymbol: string
  quantity: number
  isAutomated: boolean
  accessToken: string
  kite: ReturnType<typeof getKiteInstance>
  ltp: number
}): Promise<ChaseEntryFillResult> {
  const book = await resolveChaseBookBreakdown(args.tradingsymbol, args.accessToken)
  const entrySide = args.side === "LONG" ? "BUY" : "SELL"
  const ledgerOrders = await getOpenOrders()
  let kiteOrders: Array<{
    tradingsymbol?: string | null
    transaction_type?: string | null
    status?: string | null
  }> = []
  if (!book.paperBook) {
    try {
      kiteOrders = (await args.kite.getOrders()) as Array<{
        tradingsymbol?: string | null
        transaction_type?: string | null
        status?: string | null
      }>
    } catch (e) {
      logger.warn(
        `[processUpdateSL] live orderbook unavailable — not placing a second ${args.side} entry`,
        e
      )
      return "wait"
    }
  }
  const hasOpenEntryOrder = chaseHasWorkingEntryOrder({
    paperBook: book.paperBook,
    tradingsymbol: args.tradingsymbol,
    side: entrySide,
    ledgerOrders,
    kiteOrders,
  })
  const action = decideChaseEntryAction({
    automated: args.isAutomated,
    quantity: args.quantity,
    netQty: book.netQty,
    side: args.side,
    hasOpenEntryOrder,
    otherBookOpen: book.otherBookOpen,
  })
  const mapped = chaseFillFromDecision(action)
  if (action === "other_book_open") {
    logger.warn(
      `[processUpdateSL] ${args.side} blocked — the other paper/live Chase book is still open for ${args.tradingsymbol}`
    )
    await recordStrategySignal({
      strategy: "CHASE",
      tradingsymbol: args.tradingsymbol,
      orderTag: "chase",
      kind: "ENTRY",
      outcome: "REJECT",
      summary: "Chase will not punch this book while the other (paper/live) book is still open",
      features: {
        side: args.side,
        paperLedgerQty: book.paperLedgerQty,
        liveLedgerQty: book.liveLedgerQty,
      },
      idempotencyKey: `chase:other-book:${args.tradingsymbol}:${new Date().toISOString().slice(0, 16)}`,
    })
    return "failed"
  }
  if (mapped === "wait") {
    logger.info(
      `[processUpdateSL] ${args.side} entry still working for ${args.tradingsymbol} — not flipping status`
    )
    return mapped
  }
  if (mapped !== "place_entry") return mapped
  try {
    logger.info(
      `[processUpdateSL] placing MARKET ${entrySide} entry for ${args.tradingsymbol} qty=${args.quantity}`
    )
    await placeKiteOrder(args.accessToken, {
      tradingsymbol: args.tradingsymbol,
      exchange: "NFO",
      transaction_type: entrySide,
      quantity: args.quantity,
      order_type: "MARKET",
      product: "NRML",
      tag: "chase",
      purpose: "ENTRY",
      ltp: args.ltp,
    } as any)
    const after = await resolveChaseBookBreakdown(args.tradingsymbol, args.accessToken)
    return chaseSideHasPosition(args.side, after.netQty) ? "filled" : "placed"
  } catch (e) {
    logger.error(`[processUpdateSL] ${args.side} entry order failed`, e)
    await recordStrategySignal({
      strategy: "CHASE",
      tradingsymbol: args.tradingsymbol,
      orderTag: "chase",
      kind: "ENTRY",
      outcome: "REJECT",
      summary: `Entry retry failed — ${e instanceof Error ? e.message : String(e)}`,
      features: { side: args.side },
      idempotencyKey: `chase:entry-retry-fail:${args.tradingsymbol}:${new Date().toISOString().slice(0, 16)}`,
    })
    return "failed"
  }
}

async function processCalculateEMA(job: Job) {
  const { user } = job.data as any
  logger.info(`[processCalculateEMA] job ${job.id}`)

  if (!user) {
    logger.error("[processCalculateEMA] missing user payload")
    return null
  }

  const accessToken = user?.session?.access_token
  if (!accessToken) {
    logger.error("[processCalculateEMA] no access token in job data")
    return null
  }

  const now = nowDayjs()
  const chaseConfig = await getChaseSettings()
  const selected = chaseConfig.instruments?.length ? chaseConfig.instruments : ["NIFTY"]
  const allResults: any[] = []

  for (const nfoSymbol of selected) {
    const futuresInstruments = await getFnOExpiries(nfoSymbol, "FUT")
    if (!futuresInstruments.length) {
      logger.warn(`[processCalculateEMA] no FUT instruments found for ${nfoSymbol}`)
      const { recordOperatorAlert } = await import("../trading/alerts")
      await recordOperatorAlert({
        source: "CHASE",
        code: "CHASE_NO_FUT",
        severity: "WARN",
        summary: `Chase EMA: no FUT instruments found for ${nfoSymbol}`,
        strategy: "CHASE",
        instrument: nfoSymbol,
        idempotencyKey: `alert:chase-nofut:${nfoSymbol}:${now.format("YYYY-MM-DD")}`,
      })
      continue
    }

    const currentExpiry = dayjs(futuresInstruments[0].expiry).startOf("day")
    const currentExpiryToday = currentExpiry.isSame(now.startOf("day"), "day")

    const instruments =
      currentExpiryToday && futuresInstruments[1]
        ? futuresInstruments.slice(0, 2)
        : [futuresInstruments[0]]

    const results = await Promise.all(
      instruments.map(async instrument => {
        try {
          const prevRow = await getLatestEma(instrument.tradingsymbol)
          const prevEmaResolution = await resolveChasePrevEma(prevRow, now, accessToken)
          logger.info(
            `[processCalculateEMA] ${instrument.tradingsymbol} prevEma=${prevRow?.ema ?? "null"} resolution=${prevEmaResolution.action}`
          )
          if (prevEmaResolution.action === "gap") {
            logger.warn(
              `[processCalculateEMA] EMA gap for ${instrument.tradingsymbol}: missing ${prevEmaResolution.expectedLabel}; continue from last stored EMA ${prevEmaResolution.prevEma}`
            )
            const { recordOperatorAlert } = await import("../trading/alerts")
            await recordOperatorAlert({
              source: "CHASE",
              code: "CHASE_EMA_GAP",
              severity: "WARN",
              summary: `Chase EMA: missing ${prevEmaResolution.expectedLabel} for ${instrument.tradingsymbol}. Updating from last stored EMA (no history rebuild).`,
              strategy: "CHASE",
              instrument: nfoSymbol,
              detail: {
                tradingsymbol: instrument.tradingsymbol,
                lastStoredEma: prevEmaResolution.prevEma,
              },
              idempotencyKey: `alert:chase-ema-gap:${instrument.tradingsymbol}:${now.format("YYYY-MM-DD-HH:mm")}`,
            })
          }
          const emaResult = await calculateEma(instrument, prevEmaResolution.prevEma, accessToken)
          if (!emaResult) {
            logger.warn(
              `[processCalculateEMA] skipped for ${instrument.tradingsymbol} due to insufficient candle data or no current-day candles`
            )
            return null
          }

          const instrumentToken = Number(instrument.instrument_token)
          if (Number.isNaN(instrumentToken)) {
            throw new Error(`Invalid instrument_token for ${instrument.tradingsymbol}`)
          }

          await insertEma({
            createdAt: now.toDate(),
            tradingsymbol: instrument.tradingsymbol,
            instrumentToken,
            ema: emaResult.ema,
            highestHigh: emaResult.highestHigh,
            lowestLow: emaResult.lowestLow,
            lastClose: emaResult.lastClose,
          })
          logger.info(
            `[processCalculateEMA] inserted EMA for ${instrument.tradingsymbol} EMA=${emaResult.ema.toFixed(2)}`
          )

          return {
            tradingsymbol: instrument.tradingsymbol,
            instrumentToken: instrument.instrument_token,
            lotSize: (instrument as any).lot_size ?? 1,
            ...emaResult,
          }
        } catch (error) {
          logger.error(`[processCalculateEMA] failed for ${instrument.tradingsymbol}`, error)
          return null
        }
      })
    )

    const filteredResults = results.filter(Boolean)
    const todaysDate = toIst(now).format("YYYY-MM-DD HH:mm:ss")
    if (filteredResults.length) {
      await generateSignal(filteredResults as any[], todaysDate, accessToken, nfoSymbol)
    }
    allResults.push(...filteredResults)
  }
  return allResults
}

async function processUpdateSL(job: Job) {
  const chaseConfig = await getChaseSettings()
  const selected = chaseConfig.instruments?.length ? chaseConfig.instruments : ["NIFTY"]
  for (const nfoSymbol of selected) {
    await processUpdateSLForInstrument(job, nfoSymbol)
  }
}

async function processUpdateSLForInstrument(job: Job, nfoSymbol: string) {
  logger.info(`[processUpdateSL] job ${job.id} ${nfoSymbol}`)

  const now = nowDayjs()
  const nowIst = toIst(now)
  const currentMinutes = nowIst.hour() * 60 + nowIst.minute()
  logger.info(
    `[processUpdateSL] current time ${nowIst.format("HH:mm")} (${currentMinutes} minutes); OPEN_MINUTES=${OPEN_MINUTES}, CLOSE_MINUTES=${CLOSE_MINUTES}`
  )
  if (currentMinutes < OPEN_MINUTES || currentMinutes > CLOSE_MINUTES) {
    logger.info("[processUpdateSL] markets closed, skipping")
    return null
  }

  let chaseStatusData: Awaited<ReturnType<typeof getChaseStatus>>
  try {
    chaseStatusData = await getChaseStatus(nfoSymbol)
    logger.info(`[processUpdateSL] chase status: ${JSON.stringify(chaseStatusData)}`)
  } catch (err) {
    logger.error("[processUpdateSL] getChaseStatus threw:", err)
    return null
  }
  if (!chaseStatusData) {
    logger.error("[processUpdateSL] failed to get chase status")
    return null
  }

  const {
    status: currentStatus,
    tradingsymbol,
    stoploss,
    entryPoint,
    instrumentToken,
    createdAt,
  } = chaseStatusData

  if (
    !currentStatus ||
    !tradingsymbol ||
    !instrumentToken ||
    currentStatus === CHASE_STATUS.AWAITING_SIGNAL
  ) {
    logger.info("[processUpdateSL] no active chase position")
    return "No active chase position"
  }

  const { user } = job.data as any
  const accessToken = user?.session?.access_token
  if (!accessToken) {
    logger.error("[processUpdateSL] no access token in job data")
    return null
  }

  const futuresInstruments = await getFnOExpiries(nfoSymbol, "FUT")
  const kite = getKiteInstance(accessToken)

  const chaseConfig = await getChaseSettings()
  const lots = chaseLotsFromConfig(chaseConfig.lots)
  const isAutomated = lots > 0
  const activeInstrumentData = futuresInstruments.find(
    (i: any) => i.tradingsymbol === tradingsymbol
  )
  const lotSize: number = (activeInstrumentData as any)?.lot_size ?? 1
  const quantity = lots * lotSize

  // At 09:16: T+1 matrix / later-day EMA trail (classifier is Chase openClassify).
  if (
    (currentStatus === CHASE_STATUS.LONG || currentStatus === CHASE_STATUS.SHORT) &&
    (currentMinutes === OPEN_MINUTES ||
      toIst(chaseStatusData.updatedAt ?? now).format("YYYY-MM-DD") !== nowIst.format("YYYY-MM-DD"))
  ) {
    const prevRow = await getLatestEma(tradingsymbol)

    const previousTradingDayDayjs = toIst(
      await withRemoteRetry(async () => getPreviousTradingDay(accessToken), ms(40))
    )
    const previousTradingDay = previousTradingDayDayjs.format("YYYY-MM-DD")
    const prevEmaTarget = previousTradingDayDayjs
      .startOf("day")
      .set("hour", 16)
      .set("minute", 15)
      .set("second", 0)
      .set("millisecond", 0)
    const prevRowCreatedAt = prevRow?.createdAt ? toIst(prevRow.createdAt).startOf("minute") : null
    const isValidPrevRow = prevRowCreatedAt?.isSame(prevEmaTarget) ?? false
    const openClassify = normalizeChaseOpenClassify(chaseConfig.openClassify)
    logger.info(`[processUpdateSL] openClassify=${openClassify}`)

    let result: { ema: number; lastClose: number; lowestLow: number; highestHigh: number } | null

    if (openClassify === CHASE_OPEN_CLASSIFY.LEGACY_60M) {
      let stepped: typeof result
      if (!isValidPrevRow) {
        logger.info(
          `[processUpdateSL] prevRow not from previous trading day at 4:15 PM IST, calculating EMA freshly`
        )
        stepped = await withRemoteRetry(
          async () => calculateEma(activeInstrumentData as any, null, accessToken),
          ms(40)
        )
      } else {
        const candles = (await withRemoteRetry(
          async () =>
            kite.getHistoricalData(
              instrumentToken,
              "60minute",
              nowIst.subtract(1, "hour").toDate(),
              nowIst.toDate()
            ),
          ms(40)
        )) as HistoricalData[]
        if (!Array.isArray(candles) || !candles.length) {
          logger.error(`[processUpdateSL] no candles for ${tradingsymbol}`)
          return null
        }
        const prevEma = Number(prevRow?.ema)
        if (!Number.isFinite(prevEma)) {
          logger.error("[processUpdateSL] overnight EMA missing for legacy 09:16 classify")
          return null
        }
        stepped = calculate40EMA(candles, prevEma)
      }
      result = resolveChaseMorningSnapshot({
        openClassify,
        overnightEma: Number(prevRow?.ema ?? stepped?.ema ?? 0),
        steppedHourly: stepped,
        sessionBars: [],
      })
    } else {
      let overnightEma: number | null = null
      if (!isValidPrevRow) {
        logger.info(
          `[processUpdateSL] prevRow not from previous trading day at 4:15 PM IST, seeding EMA for 09:16 classify`
        )
        const seeded = await withRemoteRetry(
          async () => calculateEma(activeInstrumentData as any, null, accessToken),
          ms(40)
        )
        overnightEma = seeded?.ema ?? null
      } else {
        const prevEma = Number(prevRow?.ema)
        overnightEma = Number.isFinite(prevEma) ? prevEma : null
      }
      if (overnightEma == null || !Number.isFinite(overnightEma)) {
        logger.error("[processUpdateSL] EMA unavailable for 09:16 classify")
        return null
      }
      const session = await fetchChaseOpenSessionBars(kite, instrumentToken, nowIst)
      if (!session.bars.length) {
        logger.error(`[processUpdateSL] no 09:16 session candles for ${tradingsymbol}`)
        return null
      }
      logger.info(
        `[processUpdateSL] pdf_0916 session interval=${session.interval} bars=${session.bars.length}`
      )
      result = resolveChaseMorningSnapshot({
        openClassify,
        overnightEma,
        steppedHourly: null,
        sessionBars: session.bars,
      })
    }

    if (!result) {
      logger.error("[processUpdateSL] EMA calculation returned null")
      return null
    }

    const { ema, lastClose, lowestLow, highestHigh } = result
    const longT1 = Math.round(1.004 * ema)
    const shortT1 = Math.round(0.996 * ema)
    logger.info(
      `[processUpdateSL] ema=${ema} lastClose=${lastClose} longT1=${longT1} shortT1=${shortT1}`
    )

    const createdAtDate = createdAt ? toIst(createdAt).format("YYYY-MM-DD") : ""
    logger.info(
      `[processUpdateSL] previousTradingDay=${previousTradingDay} createdAtDate=${createdAtDate}`
    )
    let newStoploss = stoploss ?? 0
    const netQty =
      isAutomated && quantity > 0
        ? (await resolveChaseBookBreakdown(tradingsymbol, accessToken)).netQty
        : 0
    const hasPosition = currentStatus === CHASE_STATUS.LONG ? netQty > 0 : netQty < 0

    if (currentStatus === CHASE_STATUS.LONG && previousTradingDay === createdAtDate) {
      if (lastClose >= longT1) {
        newStoploss = Math.max(newStoploss, ema)
        logger.info(
          `[processUpdateSL] Update SL to ${newStoploss} as lastClose>=longSignalT1Tolerance`
        )
        await postToSlack(`:zap: Action $chase: Update SL for ${tradingsymbol} to ${newStoploss}`)
        await updateChaseStatus({
          instrument: nfoSymbol,
          stoploss: newStoploss,
          updatedAt: new Date(),
          tradingsymbol,
          instrumentToken,
        })
        if (isAutomated && quantity > 0) {
          if (hasPosition) await placeSL(tradingsymbol, "SELL", quantity, accessToken, newStoploss)
          else
            logger.info(
              `[processUpdateSL] no open position for ${tradingsymbol} — skipping SL order`
            )
        }
      } else if (ema <= lastClose && lastClose <= longT1) {
        const prevDayEma = await getEmaByDate(tradingsymbol, previousTradingDayDayjs.toDate())
        const previousDayLow = prevDayEma?.lowestLow ?? lowestLow
        logger.info(
          `[processUpdateSL] previousDayLow: ${previousDayLow}, ema: ${ema}, as chase is long and lastClose is less than longT1`
        )
        newStoploss = Math.max(newStoploss, Math.round((previousDayLow + ema) / 2))
        await postToSlack(`:zap: Action $chase: Update SL for ${tradingsymbol} to ${newStoploss}`)
        await updateChaseStatus({
          instrument: nfoSymbol,
          stoploss: newStoploss,
          updatedAt: new Date(),
          tradingsymbol,
          instrumentToken,
        })
        if (isAutomated && quantity > 0) {
          if (hasPosition) await placeSL(tradingsymbol, "SELL", quantity, accessToken, newStoploss)
          else
            logger.info(
              `[processUpdateSL] no open position for ${tradingsymbol} — skipping SL order`
            )
        }
      } else if (lastClose <= shortT1) {
        await postToSlack(
          `:rotating_light: Action $chase: Transaction Alert Exit ${tradingsymbol} AT CMP :stop_sign:`
        )
        const { success, error } = await updateChaseStatus({
          instrument: nfoSymbol,
          stoploss: lastClose,
          updatedAt: new Date(),
          createdAt: new Date(),
          status: CHASE_STATUS.AWAITING_SIGNAL,
          tradingsymbol,
          instrumentToken,
          isSignalBreachingTolerance: false,
        })
        if (success) {
          await insertChaseLog({ tradingsymbol, transactionType: "SELL", averagePrice: lastClose })
          if (isAutomated && quantity > 0) {
            if (hasPosition)
              await placeKiteOrder(accessToken, {
                tradingsymbol,
                exchange: "NFO",
                transaction_type: "SELL",
                quantity,
                order_type: "MARKET",
                product: "NRML",
                tag: "chase",
              } as any)
            else
              logger.info(
                `[processUpdateSL] no open position for ${tradingsymbol} — skipping exit order`
              )
          }
        } else logger.error("[processUpdateSL] error updating chase_status:", error)
      } else if (shortT1 <= lastClose && lastClose <= ema) {
        newStoploss = Math.max(newStoploss, lowestLow)
        await postToSlack(`:zap: Action $chase: Update SL for ${tradingsymbol} to ${newStoploss}`)
        await updateChaseStatus({
          instrument: nfoSymbol,
          stoploss: newStoploss,
          updatedAt: new Date(),
          tradingsymbol,
          instrumentToken,
        })
        if (isAutomated && quantity > 0) {
          if (hasPosition) await placeSL(tradingsymbol, "SELL", quantity, accessToken, newStoploss)
          else
            logger.info(
              `[processUpdateSL] no open position for ${tradingsymbol} — skipping SL order`
            )
        }
      }
    } else if (currentStatus === CHASE_STATUS.SHORT && previousTradingDay === createdAtDate) {
      if (lastClose <= shortT1) {
        newStoploss = Math.min(newStoploss, ema)
        await postToSlack(`:zap: Action $chase: Update SL for ${tradingsymbol} to ${newStoploss}`)
        await updateChaseStatus({
          instrument: nfoSymbol,
          stoploss: newStoploss,
          updatedAt: new Date(),
          tradingsymbol,
          instrumentToken,
        })
        if (isAutomated && quantity > 0) {
          if (hasPosition) await placeSL(tradingsymbol, "BUY", quantity, accessToken, newStoploss)
          else
            logger.info(
              `[processUpdateSL] no open position for ${tradingsymbol} — skipping SL order`
            )
        }
      } else if (ema >= lastClose && lastClose >= shortT1) {
        const prevDayEma = await getEmaByDate(tradingsymbol, previousTradingDayDayjs.toDate())
        const previousDayHigh = prevDayEma?.highestHigh ?? highestHigh
        logger.info("[processUpdateSL] previousDayHigh:", previousDayHigh, "ema:", ema)
        newStoploss = Math.min(newStoploss, Math.round((previousDayHigh + ema) / 2)) // Previous day high
        await postToSlack(`:zap: Action $chase: Update SL for ${tradingsymbol} to ${newStoploss}`)
        await updateChaseStatus({
          instrument: nfoSymbol,
          stoploss: newStoploss,
          updatedAt: new Date(),
          tradingsymbol,
          instrumentToken,
        })
        if (isAutomated && quantity > 0) {
          if (hasPosition) await placeSL(tradingsymbol, "BUY", quantity, accessToken, newStoploss)
          else
            logger.info(
              `[processUpdateSL] no open position for ${tradingsymbol} — skipping SL order`
            )
        }
      } else if (longT1 >= lastClose && lastClose >= ema) {
        newStoploss = Math.min(newStoploss, highestHigh)
        await postToSlack(`:zap: Action $chase: Update SL for ${tradingsymbol} to ${newStoploss}`)
        await updateChaseStatus({
          instrument: nfoSymbol,
          stoploss: newStoploss,
          updatedAt: new Date(),
          tradingsymbol,
          instrumentToken,
        })
        if (isAutomated && quantity > 0) {
          if (hasPosition) await placeSL(tradingsymbol, "BUY", quantity, accessToken, newStoploss)
          else
            logger.info(
              `[processUpdateSL] no open position for ${tradingsymbol} — skipping SL order`
            )
        }
      } else if (lastClose >= longT1) {
        await postToSlack(
          `:rotating_light: Action $chase: Transaction Alert Exit ${tradingsymbol} AT CMP :stop_sign:`
        )
        const { success, error } = await updateChaseStatus({
          instrument: nfoSymbol,
          stoploss: newStoploss,
          updatedAt: new Date(),
          createdAt: new Date(),
          status: CHASE_STATUS.AWAITING_SIGNAL,
          tradingsymbol,
          instrumentToken,
          isSignalBreachingTolerance: false,
        })
        if (success) {
          await insertChaseLog({ tradingsymbol, transactionType: "BUY", averagePrice: lastClose })
          if (isAutomated && quantity > 0) {
            if (hasPosition)
              await placeKiteOrder(accessToken, {
                tradingsymbol,
                exchange: "NFO",
                transaction_type: "BUY",
                quantity,
                order_type: "MARKET",
                product: "NRML",
                tag: "chase",
              } as any)
            else
              logger.info(
                `[processUpdateSL] no open position for ${tradingsymbol} — skipping exit order`
              )
          }
        } else logger.error("[processUpdateSL] error updating chase_status:", error)
      }
    } else {
      // Different day — update SL to EMA
      newStoploss =
        currentStatus === CHASE_STATUS.LONG
          ? Math.max(newStoploss, ema)
          : Math.min(newStoploss, ema)
      await postToSlack(`:zap: Action $chase: Update SL for ${tradingsymbol} to ${newStoploss}`)
      const { success, error } = await updateChaseStatus({
        instrument: nfoSymbol,
        stoploss: newStoploss,
        updatedAt: new Date(),
        tradingsymbol,
        instrumentToken,
        isSignalBreachingTolerance: false,
      })
      if (success) {
        if (isAutomated && quantity > 0) {
          if (hasPosition)
            await placeSL(
              tradingsymbol,
              currentStatus === CHASE_STATUS.LONG ? "SELL" : "BUY",
              quantity,
              accessToken,
              newStoploss
            )
          else
            logger.info(
              `[processUpdateSL] no open position for ${tradingsymbol} — skipping SL order`
            )
        }
      } else logger.error("[processUpdateSL] error updating chase_status:", error)
    }

    return { stoploss: newStoploss }
  }
  const currentExpiry = dayjs(activeInstrumentData.expiry)?.startOf("day")
  const currentExpiryToday = currentExpiry.isSame(now.startOf("day"), "day")

  // Rollover: switch to next month's contract
  if (
    (currentStatus === CHASE_STATUS.LONG || currentStatus === CHASE_STATUS.SHORT) &&
    currentMinutes === ROLLOVER_MINUTES &&
    currentExpiryToday
  ) {
    const nextInstrument = futuresInstruments[1]
    const prevRow = await getLatestEma(nextInstrument.tradingsymbol)
    const emaResult = await calculateEma(nextInstrument, prevRow?.ema ?? null, accessToken)
    if (!emaResult) {
      logger.error(`[processUpdateSL] rollover EMA calc failed for ${nextInstrument.tradingsymbol}`)
      return null
    }
    const newStoploss = emaResult.ema
    logger.info(
      `[processUpdateSL] Rollover to ${nextInstrument.tradingsymbol} with new SL ${newStoploss}`
    )
    await postToSlack(
      `:repeat: Action $chase: Transaction Alert, Rollover to :arrow_right: ${nextInstrument.tradingsymbol}, Chase is now *${currentStatus}* with stoploss: *${newStoploss}* :shield:`
    )
    const { success, error } = await updateChaseStatus({
      instrument: nfoSymbol,
      stoploss: newStoploss,
      updatedAt: new Date(),
      createdAt: new Date(),
      tradingsymbol: nextInstrument.tradingsymbol,
      instrumentToken: Number(nextInstrument.instrument_token),
      isSignalBreachingTolerance: false,
      entryPoint: emaResult.lastClose,
    })
    if (!success) {
      logger.error("[processUpdateSL] error updating chase_status on rollover:", error)
      return null
    }
    const ltpData = await kite.getLTP(`NFO:${tradingsymbol}`)
    const ltp = (ltpData as any)[`NFO:${tradingsymbol}`]?.last_price ?? 0
    await insertChaseLog({
      tradingsymbol,
      transactionType: currentStatus === CHASE_STATUS.SHORT ? "BUY" : "SELL",
      averagePrice: ltp,
    })
    await insertChaseLog({
      tradingsymbol: nextInstrument.tradingsymbol,
      transactionType: currentStatus === CHASE_STATUS.SHORT ? "SELL" : "BUY",
      averagePrice: emaResult.lastClose,
    })
    if (isAutomated && quantity > 0) {
      const rolloverNetQty = (await resolveChaseBookBreakdown(tradingsymbol, accessToken)).netQty
      if (rolloverNetQty === 0) {
        logger.info(
          `[processUpdateSL] no open position for ${tradingsymbol} — skipping rollover orders`
        )
      } else {
        const newLotSize: number = (nextInstrument as any)?.lot_size ?? lotSize
        const newQuantity = lots * newLotSize
        const exitSide = currentStatus === CHASE_STATUS.LONG ? "SELL" : "BUY"
        const entrySide = currentStatus === CHASE_STATUS.LONG ? "BUY" : "SELL"
        const allOrders = (await kite.getOrders()) as Order[]
        const existingSLOrder = allOrders.find(
          o =>
            o.tradingsymbol === tradingsymbol &&
            o.transaction_type === exitSide &&
            o.status === STATUS_TRIGGER_PENDING
        )
        if (existingSLOrder) {
          await kite.modifyOrder("regular", existingSLOrder.order_id, {
            order_type: "MARKET",
            market_protection: 2,
          } as any)
          logger.info(
            `[processUpdateSL] Converted SL order ${existingSLOrder.order_id} to MARKET for ${tradingsymbol} rollover`
          )
        } else {
          await placeKiteOrder(accessToken, {
            tradingsymbol,
            exchange: "NFO",
            transaction_type: exitSide,
            quantity: chaseFlattenQty(rolloverNetQty),
            order_type: "MARKET",
            product: "NRML",
            tag: "chase",
            purpose: "FLATTEN",
          } as any)
        }
        await placeKiteOrder(accessToken, {
          tradingsymbol: nextInstrument.tradingsymbol,
          exchange: "NFO",
          transaction_type: entrySide,
          quantity: newQuantity,
          order_type: "MARKET",
          product: "NRML",
          tag: "chase",
        } as any)
        await placeSL(nextInstrument.tradingsymbol, exitSide, newQuantity, accessToken, newStoploss)
      }
    }
    return { signal: "ROLLOVER", stoploss: newStoploss }
  }

  // Every minute: check 2-min candles for SL breach or entry trigger
  if (
    currentStatus === CHASE_STATUS.SHORT ||
    currentStatus === CHASE_STATUS.LONG ||
    currentStatus === CHASE_STATUS.AWAITING_SHORT ||
    currentStatus === CHASE_STATUS.AWAITING_LONG
  ) {
    const candles = (await kite.getHistoricalData(
      instrumentToken,
      "minute",
      nowIst.subtract(5, "minute").toDate(),
      nowIst.toDate()
    )) as HistoricalData[]
    if (!Array.isArray(candles) || !candles.length) {
      logger.warn(`[processUpdateSL] no 2-min candles for ${tradingsymbol}`)
      const { recordOperatorAlert } = await import("../trading/alerts")
      await recordOperatorAlert({
        source: "CHASE",
        code: "CHASE_NO_CANDLES",
        severity: "WARN",
        summary: `Chase SL: no 2-min candles for ${tradingsymbol}`,
        strategy: "CHASE",
        instrument: tradingsymbol,
        idempotencyKey: `alert:chase-nocandle:${tradingsymbol}:${nowIst.format("YYYY-MM-DDTHH:mm")}`,
      })
      return null
    }

    const candle = candles[candles.length - 1]
    logger.info(
      `[processUpdateSL] last candle date=${candle.date} open=${candle.open} high=${candle.high} low=${candle.low} close=${candle.close}`
    )
    if (
      !candle ||
      !Number.isFinite(candle.high) ||
      !Number.isFinite(candle.low) ||
      !Number.isFinite(candle.close) ||
      candle.high < candle.low ||
      candle.high <= 0 ||
      candle.close <= 0
    ) {
      logger.warn(`[processUpdateSL] invalid candle for ${tradingsymbol} — fail closed`)
      const { recordOperatorAlert } = await import("../trading/alerts")
      await recordOperatorAlert({
        source: "CHASE",
        code: "CHASE_INVALID_CANDLE",
        severity: "ERROR",
        summary: `Chase SL: invalid candle for ${tradingsymbol} — fail closed`,
        strategy: "CHASE",
        instrument: tradingsymbol,
        idempotencyKey: `alert:chase-badcandle:${tradingsymbol}:${nowIst.format("YYYY-MM-DDTHH:mm")}`,
      })
      return null
    }
    const candleAgeSec = (nowIst.valueOf() - dayjs(candle.date).valueOf()) / 1000
    if (Number.isFinite(candleAgeSec) && candleAgeSec > 180) {
      logger.warn(
        `[processUpdateSL] stale candle ${Math.round(candleAgeSec)}s old — not trading on it`
      )
      return null
    }

    await matchPaperWorkingStops({
      tradingsymbol,
      last: candle.close,
      high: candle.high,
      low: candle.low,
    })

    const flattenChase = async (side: "BUY" | "SELL") => {
      if (!isAutomated || quantity <= 0) return
      const netQty = (await resolveChaseBookBreakdown(tradingsymbol, accessToken)).netQty
      const flattenQty = chaseFlattenQty(netQty)
      if (flattenQty === 0) {
        logger.info(`[processUpdateSL] SL breach but no Chase book for ${tradingsymbol}`)
        const { recordOperatorAlert } = await import("../trading/alerts")
        await recordOperatorAlert({
          source: "CHASE",
          code: "CHASE_SL_NO_POSITION",
          severity: "WARN",
          summary: `Chase SL breached but no Chase book for ${tradingsymbol}`,
          strategy: "CHASE",
          instrument: tradingsymbol,
          idempotencyKey: `alert:chase-sl-flat:${tradingsymbol}:${nowIst.format("YYYY-MM-DDTHH:mm")}`,
        })
        return
      }
      await placeKiteOrder(accessToken, {
        tradingsymbol,
        exchange: "NFO",
        transaction_type: side,
        quantity: flattenQty,
        order_type: "MARKET",
        product: "NRML",
        tag: "chase",
        purpose: "FLATTEN",
      } as any)
    }

    if (currentStatus === CHASE_STATUS.SHORT && candle.high >= (stoploss ?? 0)) {
      logger.info(`[processUpdateSL] SL breached SHORT for ${tradingsymbol}`)
      await flattenChase("BUY")
      await postToSlack(
        `:rotating_light: Transaction alert exit_short. Chase is now Awaiting Signal :hourglass_flowing_sand:`
      )
      const { success, error } = await updateChaseStatus({
        instrument: nfoSymbol,
        status: CHASE_STATUS.AWAITING_SIGNAL,
        isSignalBreachingTolerance: false,
      })
      if (success)
        await insertChaseLog({ tradingsymbol, transactionType: "BUY", averagePrice: stoploss ?? 0 })
      else logger.error("[processUpdateSL] error updating chase_status:", error)
      return { signal: "TRANSACTION_ALERT", stoploss }
    } else if (currentStatus === CHASE_STATUS.LONG && candle.low <= (stoploss ?? 0)) {
      logger.info(`[processUpdateSL] SL breached LONG for ${tradingsymbol}`)
      await flattenChase("SELL")
      await postToSlack(
        `:rotating_light: Transaction alert exit_long. Chase is now Awaiting Signal :hourglass_flowing_sand:`
      )
      const { success, error } = await updateChaseStatus({
        instrument: nfoSymbol,
        status: CHASE_STATUS.AWAITING_SIGNAL,
        isSignalBreachingTolerance: false,
      })
      if (success)
        await insertChaseLog({
          tradingsymbol,
          transactionType: "SELL",
          averagePrice: stoploss ?? 0,
        })
      else logger.error("[processUpdateSL] error updating chase_status:", error)
      return { signal: "TRANSACTION_ALERT", stoploss }
    } else if (currentStatus === CHASE_STATUS.AWAITING_LONG) {
      const awaitingLongBook = await resolveChaseBookBreakdown(tradingsymbol, accessToken)
      const longReady =
        chaseSideHasPosition("LONG", awaitingLongBook.netQty) || candle.high >= (entryPoint ?? 0)
      if (!longReady) {
        logger.info("[processUpdateSL] no action taken")
        return null
      }
      logger.info(`[processUpdateSL] Entry triggered AWAITING_LONG for ${tradingsymbol}`)
      const fill = await ensureChaseEntryFilled({
        side: "LONG",
        tradingsymbol,
        quantity,
        isAutomated,
        accessToken,
        kite,
        ltp: candle.close,
      })
      if (!chaseFillAllowsStatusFlip(fill)) {
        logger.info(`[processUpdateSL] AWAITING_LONG trigger but entry ${fill} — not marking LONG`)
        return null
      }
      await postToSlack(`:rocket: Transaction Alert enter_long. Chase is now *Long* :arrow_up:`)
      const { success, error } = await updateChaseStatus({
        instrument: nfoSymbol,
        status: CHASE_STATUS.LONG,
        createdAt: new Date(),
        isSignalBreachingTolerance: false,
      })
      if (success) {
        await insertChaseLog({
          tradingsymbol,
          transactionType: "BUY",
          averagePrice: entryPoint ?? 0,
        })
        if (isAutomated && quantity > 0) {
          const entryNetQty = (await resolveChaseBookBreakdown(tradingsymbol, accessToken)).netQty
          if (entryNetQty > 0) {
            await placeKiteOrder(accessToken, {
              tradingsymbol,
              exchange: "NFO",
              transaction_type: "SELL",
              quantity,
              order_type: "SL",
              product: "NRML",
              tag: "chase",
              purpose: "SL",
              trigger_price: stoploss ?? 0,
              price: (stoploss ?? 0) - 5,
            } as any)
          } else {
            logger.info(
              `[processUpdateSL] no long position for ${tradingsymbol} — skipping SL order`
            )
          }
        }
      } else logger.error("[processUpdateSL] error updating chase_status:", error)
      return { signal: "TRANSACTION_ALERT", stoploss }
    } else if (currentStatus === CHASE_STATUS.AWAITING_SHORT) {
      const awaitingShortBook = await resolveChaseBookBreakdown(tradingsymbol, accessToken)
      const shortReady =
        chaseSideHasPosition("SHORT", awaitingShortBook.netQty) || candle.low <= (entryPoint ?? 0)
      if (!shortReady) {
        logger.info("[processUpdateSL] no action taken")
        return null
      }
      logger.info(`[processUpdateSL] Entry triggered AWAITING_SHORT for ${tradingsymbol}`)
      const fill = await ensureChaseEntryFilled({
        side: "SHORT",
        tradingsymbol,
        quantity,
        isAutomated,
        accessToken,
        kite,
        ltp: candle.close,
      })
      if (!chaseFillAllowsStatusFlip(fill)) {
        logger.info(
          `[processUpdateSL] AWAITING_SHORT trigger but entry ${fill} — not marking SHORT`
        )
        return null
      }
      await postToSlack(`:rocket: Transaction Alert enter_short. Chase is now *Short* :arrow_down:`)
      const { success, error } = await updateChaseStatus({
        instrument: nfoSymbol,
        status: CHASE_STATUS.SHORT,
        createdAt: new Date(),
        isSignalBreachingTolerance: false,
      })
      if (success) {
        await insertChaseLog({
          tradingsymbol,
          transactionType: "SELL",
          averagePrice: entryPoint ?? 0,
        })
        if (isAutomated && quantity > 0) {
          const entryNetQty = (await resolveChaseBookBreakdown(tradingsymbol, accessToken)).netQty
          if (entryNetQty < 0) {
            await placeKiteOrder(accessToken, {
              tradingsymbol,
              exchange: "NFO",
              transaction_type: "BUY",
              quantity,
              order_type: "SL",
              product: "NRML",
              tag: "chase",
              purpose: "SL",
              trigger_price: stoploss ?? 0,
              price: (stoploss ?? 0) + 5,
            } as any)
          } else {
            logger.info(
              `[processUpdateSL] no short position for ${tradingsymbol} — skipping SL order`
            )
          }
        }
      } else logger.error("[processUpdateSL] error updating chase_status:", error)
      return { signal: "TRANSACTION_ALERT", stoploss }
    } else if (
      (currentStatus === CHASE_STATUS.LONG || currentStatus === CHASE_STATUS.SHORT) &&
      isAutomated &&
      quantity > 0
    ) {
      const side = currentStatus === CHASE_STATUS.LONG ? "LONG" : "SHORT"
      const book = await resolveChaseBookBreakdown(tradingsymbol, accessToken)
      const entrySide = side === "LONG" ? "BUY" : "SELL"
      let kiteOrders: Array<{
        tradingsymbol?: string | null
        transaction_type?: string | null
        status?: string | null
      }> = []
      if (!book.paperBook) {
        try {
          kiteOrders = (await kite.getOrders()) as Array<{
            tradingsymbol?: string | null
            transaction_type?: string | null
            status?: string | null
          }>
        } catch (e) {
          logger.warn(
            `[processUpdateSL] live orderbook unavailable — treating ${side} as wait, not punching lots`,
            e
          )
          kiteOrders = [
            { tradingsymbol, transaction_type: entrySide, status: STATUS_TRIGGER_PENDING },
          ]
        }
      }
      const hasOpenEntryOrder = chaseHasWorkingEntryOrder({
        paperBook: book.paperBook,
        tradingsymbol,
        side: entrySide,
        ledgerOrders: await getOpenOrders(),
        kiteOrders,
      })
      const sync = decideChaseInPositionSync({
        netQty: book.netQty,
        side,
        hasOpenEntryOrder,
      })
      if (sync === "wait_entry") {
        logger.info(
          `[processUpdateSL] ${side} still waiting on a working entry for ${tradingsymbol}`
        )
      } else if (sync === "hold" && stoploss) {
        const exitSide = side === "LONG" ? "SELL" : "BUY"
        await placeSL(tradingsymbol, exitSide, chaseFlattenQty(book.netQty), accessToken, stoploss)
      } else if (sync === "reset_empty") {
        logger.warn(
          `[processUpdateSL] ${side} with no fill — reverting to AWAITING_SIGNAL (will not punch lots)`
        )
        await updateChaseStatus({
          instrument: nfoSymbol,
          status: CHASE_STATUS.AWAITING_SIGNAL,
          isSignalBreachingTolerance: false,
          updatedAt: new Date(),
        })
        await recordStrategySignal({
          strategy: "CHASE",
          tradingsymbol,
          orderTag: "chase",
          kind: "STATE",
          outcome: "INVALID",
          summary: `${side} with no fill — reset to AWAITING_SIGNAL so Chase does not open a new position`,
          features: { status: currentStatus, netQty: book.netQty },
          idempotencyKey: `chase:phantom-reset:${tradingsymbol}:${new Date().toISOString().slice(0, 16)}`,
        })
      }
    }
  }

  logger.info("[processUpdateSL] no action taken")
  return null
}

const worker = new Worker(
  CHASE_Q_NAME,
  async job => {
    const name = job.name || ""
    switch (name) {
      case "calculateEMA":
        return processCalculateEMA(job)
      case "updateSL":
        return processUpdateSL(job)
      default: {
        logger.info(`[chaseQueue] unknown job name ${name}`)
        return null
      }
    }
  },
  {
    connection: redisConnection,
    concurrency: 1,
    lockDuration: ms(5 * 60),
  }
)

worker.on("error", err => {
  logger.error("🔴 [chaseQueue] worker error", err)
})

worker.on("failed", (job, err) => {
  logger.error(`🔴 [chaseQueue] job ${job?.id} (${job?.name}) failed`, err)
})

export { worker }
