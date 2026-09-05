import { eq } from "drizzle-orm"

import { STRATEGIES, STRATEGIES_DETAILS } from "./constants"
import { db } from "./drizzle"
import { strategyDefaults } from "./schema"

const CODE_DEFAULTS: Record<string, Record<string, unknown>> = {
  [STRATEGIES.ATM_STRADDLE]: {
    ...STRATEGIES_DETAILS[STRATEGIES.ATM_STRADDLE].defaultFormState,
    name: "ATM Straddle",
  },
  [STRATEGIES.ATM_STRANGLE]: {
    ...STRATEGIES_DETAILS[STRATEGIES.ATM_STRANGLE].defaultFormState,
    name: "ATM Strangle",
  },
}

export function codeDefaultsFor(strategy: STRATEGIES): Record<string, unknown> {
  return { ...(CODE_DEFAULTS[strategy] ?? {}) }
}

export async function getMergedDefaults(strategy: STRATEGIES): Promise<Record<string, unknown>> {
  const [row] = await db
    .select()
    .from(strategyDefaults)
    .where(eq(strategyDefaults.strategy, strategy))
    .limit(1)

  return {
    ...CODE_DEFAULTS[strategy],
    ...((row?.config as Record<string, unknown> | undefined) ?? {}),
  }
}

export async function upsertDefaults(
  strategy: STRATEGIES,
  config: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const merged = { ...CODE_DEFAULTS[strategy], ...config }
  await db
    .insert(strategyDefaults)
    .values({ strategy, config: merged, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: strategyDefaults.strategy,
      set: { config: merged, updatedAt: new Date() },
    })
  return merged
}
