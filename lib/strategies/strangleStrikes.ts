import { STRANGLE_ENTRY_STRATEGIES } from "../constants"

export type StrangleStrikeResult = {
  lowerLegPEStrike: number
  higherLegCEStrike: number
}

export function computeStrikesFromDistance(
  atmStrike: number,
  strikeStepSize: number,
  distanceFromAtm: number
): StrangleStrikeResult {
  return {
    lowerLegPEStrike: atmStrike - distanceFromAtm * strikeStepSize,
    higherLegCEStrike: atmStrike + distanceFromAtm * strikeStepSize,
  }
}

export function computeStrikesFromPercent(
  atmStrike: number,
  strikeStepSize: number,
  percentfromAtm: number
): StrangleStrikeResult {
  return {
    lowerLegPEStrike:
      Math.round(((1 - percentfromAtm / 100) * atmStrike) / strikeStepSize) * strikeStepSize,
    higherLegCEStrike:
      Math.round(((1 + percentfromAtm / 100) * atmStrike) / strikeStepSize) * strikeStepSize,
  }
}

export function applyInvertedStrikes(
  strikes: StrangleStrikeResult,
  inverted: boolean
): { peStrike: number; ceStrike: number } {
  return {
    peStrike: inverted ? strikes.higherLegCEStrike : strikes.lowerLegPEStrike,
    ceStrike: inverted ? strikes.lowerLegPEStrike : strikes.higherLegCEStrike,
  }
}

export function entryStrategyRequiresPriceLookup(entryStrategy: string): boolean {
  return entryStrategy === STRANGLE_ENTRY_STRATEGIES.ENTRY_PRICE
}
