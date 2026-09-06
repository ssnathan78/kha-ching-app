import dayjs from "dayjs"
import { COMBINED_SL_EXIT_STRATEGY, SL_ORDER_TYPE } from "../types/plans"

function envPositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback
}

const NEXT_PUBLIC_DEFAULT_LOTS = envPositiveInt(process.env.NEXT_PUBLIC_DEFAULT_LOTS, 1)
const NEXT_PUBLIC_DEFAULT_SKEW_PERCENT = envPositiveInt(
  process.env.NEXT_PUBLIC_DEFAULT_SKEW_PERCENT,
  10
)
const NEXT_PUBLIC_DEFAULT_SLM_PERCENT = envPositiveInt(
  process.env.NEXT_PUBLIC_DEFAULT_SLM_PERCENT,
  30
)

export enum INSTRUMENTS {
  NIFTY = "NIFTY",
  BANKNIFTY = "BANKNIFTY",
  FINNIFTY = "FINNIFTY",
}

export const CHASE_STATUS = {
  SHORT: "SHORT",
  LONG: "LONG",
  AWAITING_SHORT: "AWAITING_SHORT",
  AWAITING_LONG: "AWAITING_LONG",
  AWAITING_SIGNAL: "AWAITING_SIGNAL",
} as const

export enum TRANSACTION_TYPE {
  BUY = "BUY",
  SELL = "SELL",
}

export interface INSTRUMENT_PROPERTIES {
  lotSize: number
  displayName: string
  underlyingSymbol: string
  nfoSymbol: string
  exchange: string
  strikeStepSize: number
  freezeQty: number
  /** NSE weekly options exist only for Nifty 50 (since Nov 2024). */
  hasWeeklyExpiry: boolean
}

export interface COMPLETED_BY_TAG {
  tradingsymbol: string // "NIFTY21OCT17350CE"
  quantity: number //-ve if sell , +ve if buy
  points: number // sell -buy
}

export const INSTRUMENT_DETAILS: Record<INSTRUMENTS, INSTRUMENT_PROPERTIES> = {
  [INSTRUMENTS.NIFTY]: {
    lotSize: 65,
    displayName: "NIFTY",
    underlyingSymbol: "NIFTY 50",
    nfoSymbol: "NIFTY",
    exchange: "NSE",
    strikeStepSize: 50,
    freezeQty: 1800,
    hasWeeklyExpiry: true,
  },
  [INSTRUMENTS.BANKNIFTY]: {
    lotSize: 30,
    displayName: "BANKNIFTY",
    underlyingSymbol: "NIFTY BANK",
    nfoSymbol: "BANKNIFTY",
    exchange: "NSE",
    strikeStepSize: 100,
    freezeQty: 900,
    hasWeeklyExpiry: false,
  },
  [INSTRUMENTS.FINNIFTY]: {
    lotSize: 60,
    displayName: "FINNIFTY",
    underlyingSymbol: "NIFTY FIN SERVICE",
    nfoSymbol: "FINNIFTY",
    exchange: "NSE",
    strikeStepSize: 50,
    freezeQty: 1800,
    hasWeeklyExpiry: false,
  },
}

export enum STRATEGIES {
  ATM_STRADDLE = "ATM_STRADDLE",
  ATM_STRANGLE = "ATM_STRANGLE",
  CHASE = "CHASE",
}

export const INTRADAY_STRATEGIES = [STRATEGIES.ATM_STRADDLE, STRATEGIES.ATM_STRANGLE] as const
export type KillDeskScope = "intraday" | "all"

export enum EXIT_STRATEGIES {
  INDIVIDUAL_LEG_SLM_1X = "INDIVIDUAL_LEG_SLM_1X",
  MULTI_LEG_PREMIUM_THRESHOLD = "MULTI_LEG_PREMIUM_THRESHOLD",
  MIN_XPERCENT_OR_SUPERTREND = "MIN_XPERCENT_OR_SUPERTREND",
  OBS_TRAIL_SL = "OBS_TRAIL_SL",
  NO_SL = "NO_SL",
}

export enum ENTRY_ORDER {
  MARKET_ORDER = "MARKET_ORDER",
  STOP_LOSS_MARKET_ORDER = "STOP_LOSS_MARKET_ORDER",
}

export enum PRODUCT_TYPE {
  MIS = "MIS",
  NRML = "NRML",
}

export enum VOLATILITY_TYPE {
  LONG = "LONG",
  SHORT = "SHORT",
}

export enum EXPIRY_TYPE {
  CURRENT = "CURRENT",
  NEXT = "NEXT",
  MONTHLY = "MONTHLY",
}

export const EXPIRY_TYPE_HUMAN = {
  [EXPIRY_TYPE.CURRENT]: "Current expiry",
  [EXPIRY_TYPE.NEXT]: "Next expiry",
  [EXPIRY_TYPE.MONTHLY]: "Monthly expiry",
}

export function expiryTypesForInstrument(instrument?: INSTRUMENTS): EXPIRY_TYPE[] {
  if (instrument && INSTRUMENT_DETAILS[instrument]?.hasWeeklyExpiry) {
    return [EXPIRY_TYPE.CURRENT, EXPIRY_TYPE.NEXT, EXPIRY_TYPE.MONTHLY]
  }
  return [EXPIRY_TYPE.CURRENT, EXPIRY_TYPE.NEXT]
}

export enum STRANGLE_ENTRY_STRATEGIES {
  DISTANCE_FROM_ATM = "DISTANCE_FROM_ATM",
  PERCENT_FROM_ATM = "PERCENT_FROM_ATM",
  ENTRY_PRICE = "ENTRY_PRICE",
}
export enum ANCILLARY_TASKS {
  ORDERBOOK_SYNC_BY_TAG = "ORDERBOOK_SYNC_BY_TAG",
  CLEANUP_COMPLETED_JOBS = "CLEANUP_COMPLETED_JOBS",
  ORDERBOOKSYNC = "ORDERBOOKSYNC",
}

export enum JOB_EXECUTION_STATUS {
  PENDING = "PENDING", // Initial state when job execution record is created
  QUEUE = "QUEUE", // Job successfully added to BullMQ queue
  EXECUTING = "EXECUTING", // Job is currently being processed
  COMPLETED = "COMPLETED", // Entry orders placed successfully
  FAILED = "FAILED", // Job execution failed
  REJECT = "REJECT", // Failed to add job to queue
  CANCELLED = "CANCELLED", // Job was manually cancelled
  SQUARED_OFF = "SQUARED_OFF", // Both legs fully squared off
}

export const COMBINED_SL_EXIT_STRATEGY_LABEL = {
  [COMBINED_SL_EXIT_STRATEGY.EXIT_ALL]: "Exit all legs",
  [COMBINED_SL_EXIT_STRATEGY.EXIT_LOSING]: "Exit losing legs only and bring others to cost",
}

const getInstrumentsDefaultState = (): Record<INSTRUMENTS, boolean> =>
  Object.values(INSTRUMENTS).reduce<Record<string, boolean>>(
    (accum, item) => ({
      ...accum,
      [item]: false,
    }),
    {}
  )

export const STRATEGIES_DETAILS = {
  [STRATEGIES.ATM_STRADDLE]: {
    premium: false,
    heading: "Long/Short Straddle — ATM",
    defaultRunAt: dayjs().set("hour", 12).set("minutes", 20).set("seconds", 0).format(),
    margin1x: {
      [INSTRUMENTS.NIFTY]: 145000,
      [INSTRUMENTS.BANKNIFTY]: 150000,
      [INSTRUMENTS.FINNIFTY]: 100000,
    },
    defaultFormState: {
      instruments: getInstrumentsDefaultState(),
      name: "ATM Straddle",
      lots: NEXT_PUBLIC_DEFAULT_LOTS,
      maxSkewPercent: NEXT_PUBLIC_DEFAULT_SKEW_PERCENT,
      thresholdSkewPercent: 20,
      takeTradeIrrespectiveSkew: false,
      slmPercent: NEXT_PUBLIC_DEFAULT_SLM_PERCENT,
      trailEveryPercentageChangeValue: 2,
      trailingSlPercent: NEXT_PUBLIC_DEFAULT_SLM_PERCENT,
      productType: PRODUCT_TYPE.MIS,
      volatilityType: VOLATILITY_TYPE.SHORT,
      expiryType: EXPIRY_TYPE.CURRENT,
      runNow: false,
      isMaxLossEnabled: true,
      trailingMaxLossPoints: -18,
      isMaxProfitEnabled: true,
      trailingMaxProfitPoints: 12,
      trailingProfitPercent: 10,
      maxLossPoints: 20,
      maxProfitPoints: 20,
      expireIfUnsuccessfulInMins: 10,
      isAutoSquareOffEnabled: true,
      exitStrategy: EXIT_STRATEGIES.INDIVIDUAL_LEG_SLM_1X,
      slOrderType: SL_ORDER_TYPE.SLL,
      slLimitPricePercent: 1,
      combinedExitStrategy: COMBINED_SL_EXIT_STRATEGY.EXIT_ALL,
      rollback: {
        onBrokenHedgeOrders: true,
        onBrokenPrimaryOrders: true,
        onBrokenExitOrders: true,
      },
    },
  },
  [STRATEGIES.ATM_STRANGLE]: {
    premium: false,
    heading: "Long/Short Strangle",
    defaultRunAt: dayjs().set("hour", 12).set("minutes", 20).set("seconds", 0).format(),
    margin1x: {
      [INSTRUMENTS.NIFTY]: 420000,
      [INSTRUMENTS.BANKNIFTY]: 425000,
    },
    defaultFormState: {
      instruments: getInstrumentsDefaultState(),
      name: "ATM Strangle",
      lots: NEXT_PUBLIC_DEFAULT_LOTS,
      slmPercent: NEXT_PUBLIC_DEFAULT_SLM_PERCENT,
      trailEveryPercentageChangeValue: 2,
      trailingSlPercent: NEXT_PUBLIC_DEFAULT_SLM_PERCENT,
      inverted: false,
      entryStrategy: STRANGLE_ENTRY_STRATEGIES.DISTANCE_FROM_ATM,
      distanceFromAtm: 1,
      optionPrice: 20,
      productType: PRODUCT_TYPE.MIS,
      volatilityType: VOLATILITY_TYPE.SHORT,
      expiryType: EXPIRY_TYPE.CURRENT,
      runNow: false,
      isAutoSquareOffEnabled: true,
      exitStrategy: EXIT_STRATEGIES.INDIVIDUAL_LEG_SLM_1X,
      orderType: ENTRY_ORDER.MARKET_ORDER,
      slOrderType: SL_ORDER_TYPE.SLL,
      slLimitPricePercent: 1,
      combinedExitStrategy: COMBINED_SL_EXIT_STRATEGY.EXIT_ALL,
      rollback: {
        onBrokenHedgeOrders: true,
        onBrokenPrimaryOrders: true,
        onBrokenExitOrders: true,
      },
    },
    ENTRY_STRATEGIES: STRANGLE_ENTRY_STRATEGIES,
    ENTRY_STRATEGY_DETAILS: {
      [STRANGLE_ENTRY_STRATEGIES.DISTANCE_FROM_ATM]: {
        label: "by distance from ATM strike",
      },
      [STRANGLE_ENTRY_STRATEGIES.PERCENT_FROM_ATM]: {
        label: "by percent from ATM%",
      },
      [STRANGLE_ENTRY_STRATEGIES.ENTRY_PRICE]: {
        label: "by option price",
      },
    },
    ENTRY_ORDER: {
      [ENTRY_ORDER.MARKET_ORDER]: {
        label: "Market Order",
      },
      [ENTRY_ORDER.STOP_LOSS_MARKET_ORDER]: {
        label: "Stop Loss Market/Limit Order",
      },
    },
  },
  [STRATEGIES.CHASE]: {
    heading: "Chase",
    defaultRunAt: dayjs().set("hour", 9).set("minutes", 16).set("seconds", 0).format(),
    defaultFormState: {
      lots: 1,
      emaPeriod: 40,
      bufferPercent: 0.2,
      entryLimitOffset: 5,
    },
  },
}

export const ROLLBACK_KEY_MAP = {
  onBrokenHedgeOrders: "If taking the hedge position fails",
  onBrokenPrimaryOrders: "If taking the primary position fails",
  onBrokenExitOrders: "If placing any SL order fail",
}

export const EXIT_STRATEGIES_DETAILS = {
  [EXIT_STRATEGIES.INDIVIDUAL_LEG_SLM_1X]: {
    label: "Fixed SL% on all legs",
  },
  [EXIT_STRATEGIES.MULTI_LEG_PREMIUM_THRESHOLD]: {
    label: "Combined/trailing SL%",
  },
  [EXIT_STRATEGIES.MIN_XPERCENT_OR_SUPERTREND]: {
    label: "Initial SL%, then trail Option Supertrend",
  },
  [EXIT_STRATEGIES.OBS_TRAIL_SL]: {
    label: "Initial 30%, then trail SL on every higher close (1min TF)",
  },
  [EXIT_STRATEGIES.NO_SL]: {
    label: "No SL",
  },
}

export const WATCHERS = {
  SLM_WATCHER: "SLM_WATCHER",
}

export const WATCHERS_DETAILS = {
  [WATCHERS.SLM_WATCHER]: {
    label: 'Ensure order even if SL-M gets "Cancelled"',
  },
}

export const MAX_MIS_ORDER_DURATION_SECONDS = 6 * 60 * 60 // [9.15am, 3.15pm]

export const USER_OVERRIDE = {
  ABORT: "ABORT",
  RESUME: "RESUME",
}

export const ERROR_STRINGS = {
  PAID_FEATURE: "Feature not enabled",
  PAID_STRATEGY: "Strategy not enabled",
}

export const SUBSCRIPTION_TYPE = {
  SUBSCRIBER: "SUBSCRIBER",
  NOT_SUBSCRIBER: "NOT_SUBSCRIBER",
}

export const SUBSCRIBER_TYPE = {
  PREMIUM: "PREMIUM",
  CLUB: "CLUB",
}

export const ACCESSTOKEN = "accessToken"
export const TRADES = "trades"

export const STATUS_TRIGGER_PENDING = "TRIGGER PENDING" as const
