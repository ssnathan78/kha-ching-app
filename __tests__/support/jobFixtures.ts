import dayjs from "dayjs"
import {
  EXIT_STRATEGIES,
  EXPIRY_TYPE,
  INSTRUMENTS,
  PRODUCT_TYPE,
  STRANGLE_ENTRY_STRATEGIES,
  STRATEGIES,
  VOLATILITY_TYPE,
} from "../../lib/constants"
import { COMBINED_SL_EXIT_STRATEGY, SL_ORDER_TYPE } from "../../types/plans"
import type { ATM_STRADDLE_TRADE, ATM_STRANGLE_TRADE } from "../../types/trade"

const defaultSquareOff = dayjs().hour(15).minute(20).second(0).millisecond(0).toISOString()

export function baseStraddleJob(overrides: Partial<ATM_STRADDLE_TRADE> = {}): ATM_STRADDLE_TRADE {
  return {
    strategy: STRATEGIES.ATM_STRADDLE,
    name: "Test Straddle",
    instrument: INSTRUMENTS.NIFTY,
    lots: 1,
    volatilityType: VOLATILITY_TYPE.SHORT,
    productType: PRODUCT_TYPE.MIS,
    expiryType: EXPIRY_TYPE.CURRENT,
    exitStrategy: EXIT_STRATEGIES.INDIVIDUAL_LEG_SLM_1X,
    combinedExitStrategy: COMBINED_SL_EXIT_STRATEGY.EXIT_ALL,
    slOrderType: SL_ORDER_TYPE.SLL,
    slLimitPricePercent: 1,
    slmPercent: 30,
    maxSkewPercent: 10,
    thresholdSkewPercent: 20,
    expireIfUnsuccessfulInMins: 10,
    takeTradeIrrespectiveSkew: false,
    isAutoSquareOffEnabled: true,
    squareOffTime: defaultSquareOff,
    runNow: true,
    isMaxLossEnabled: true,
    isMaxProfitEnabled: true,
    maxLossPoints: -18,
    maxProfitPoints: 12,
    trailingProfitPercent: 10,
    isHedgeEnabled: false,
    onBrokenHedgeOrders: false,
    onBrokenPrimaryOrders: false,
    onBrokenExitOrders: false,
    ...overrides,
  } as ATM_STRADDLE_TRADE
}

export function baseStrangleJob(overrides: Partial<ATM_STRANGLE_TRADE> = {}): ATM_STRANGLE_TRADE {
  return {
    strategy: STRATEGIES.ATM_STRANGLE,
    name: "Test Strangle",
    instrument: INSTRUMENTS.NIFTY,
    lots: 1,
    volatilityType: VOLATILITY_TYPE.SHORT,
    productType: PRODUCT_TYPE.MIS,
    expiryType: EXPIRY_TYPE.CURRENT,
    exitStrategy: EXIT_STRATEGIES.NO_SL,
    combinedExitStrategy: COMBINED_SL_EXIT_STRATEGY.EXIT_ALL,
    slOrderType: SL_ORDER_TYPE.SLL,
    slLimitPricePercent: 1,
    slmPercent: 30,
    entryStrategy: STRANGLE_ENTRY_STRATEGIES.DISTANCE_FROM_ATM,
    distanceFromAtm: 2,
    isAutoSquareOffEnabled: true,
    squareOffTime: defaultSquareOff,
    runNow: true,
    isMaxLossEnabled: false,
    isMaxProfitEnabled: false,
    onBrokenHedgeOrders: false,
    onBrokenPrimaryOrders: false,
    onBrokenExitOrders: false,
    ...overrides,
  } as ATM_STRANGLE_TRADE
}

export function minimalPlanConfig(strategy: STRATEGIES = STRATEGIES.ATM_STRADDLE) {
  if (strategy === STRATEGIES.ATM_STRANGLE) {
    return baseStrangleJob({ strategy })
  }
  return baseStraddleJob({ strategy })
}
